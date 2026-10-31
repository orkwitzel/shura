import {
  type Action,
  createEngine,
  type Engine,
  FFA,
  type HoleSeedsState,
  holeSeeds,
  ONE_VS_ONE,
  type SentGarbage,
} from '@shura/engine';
import {
  type ClientMessageOf,
  GARBAGE_ACK_TIMEOUT,
  type OutReason,
  type RoomMode,
  type ServerMessage,
  type ServerMessageOf,
} from '@shura/protocol';
import type { MatchLog } from '@shura/valkey';
import type { ServerClock } from './clock';
import { IncomingGarbage } from './incoming-garbage';
import type { Logger } from './logger';
import { MatchClock } from './match-clock';
import { MatchLogWriter } from './match-log-writer';
import { chooseTarget, createMatchRng, type MatchRng } from './targeting';

/** One frame's actions, as an input batch or a relay lists them. */
export type FrameActions = ClientMessageOf<'inputBatch'>['frames'][number];

/** Where a match's messages go: the room decides who is in it. */
export interface MatchOutput {
  /** To one player's client. */
  toPlayer(playerId: string, message: ServerMessage): void;
  /** To everyone in the room but `playerId`: the other players and the spectators. */
  toOthers(playerId: string, message: ServerMessage): void;
  /** To everyone in the room. */
  toRoom(message: ServerMessage): void;
  /** The match has ended and `matchEnd` has gone out. */
  ended(result: ServerMessageOf<'matchEnd'>): void;
}

export interface MatchPlayerInfo {
  readonly id: string;
  readonly nickname: string;
}

export interface MatchOptions {
  readonly matchId: string;
  readonly mode: RoomMode;
  readonly seed: number;
  /** In match order: each player's position is their index, which seeds their engine. */
  readonly players: readonly MatchPlayerInfo[];
  /** The server's clock, which the players' batches must keep up with (design §8.4). */
  readonly clock: ServerClock;
  /** Server time at the start of frame 0: the countdown's `startAt`. */
  readonly startAt: number;
  readonly output: MatchOutput;
  /** The room's ownership epoch, which tags the match log's appends (design §9.3). */
  readonly epoch: number;
  /** Where the match log goes (design §9.6). */
  readonly log: MatchLog;
  readonly logger: Logger;
}

/** A player's game as the server verified it, for the server/client hash check (design §14). */
export interface VerifiedGame {
  readonly playerId: string;
  /** The last frame verified. */
  readonly frame: number;
  readonly hash: string;
}

interface Out {
  readonly reason: OutReason;
  readonly frame: number;
}

/** One player of a match: the server's copy of their game. */
interface Player {
  readonly id: string;
  readonly index: number;
  readonly engine: Engine;
  /** The `seq` the next input batch must have. */
  nextSeq: number;
  /** The last frame verified. */
  frame: number;
  /** Verified frames not yet relayed to the room. */
  unrelayed: FrameActions[];
  out: Out | null;
  /** The garbage lines their clears sent, after cancelling (design §8.5). */
  linesSent: number;
  /** Their garbage RNG, which deals the hole seeds of the attacks sent to them (design §3). */
  readonly holes: HoleSeedsState;
  /** The attacks sent to them and not yet received and accepted (design §8.5). */
  readonly incoming: IncomingGarbage;
}

const PLAY_SETTINGS = { '1v1': ONE_VS_ONE, ffa: FFA } as const;

/**
 * A match on the server (design §8.1): one engine per player, each verified by replaying that
 * player's input batches, acknowledged and relayed to the room per tick, with players going out
 * when the replay tops them out, they fall behind or run ahead of the server's clock, or they
 * leave, and the placements once it's settled.
 *
 * Garbage goes from attacker to target as the server verifies it (design §8.5): routed with
 * `garbageQueued`, checked when the target's batches receive it, and timed until they accept it.
 * Every verified batch and routing goes into the match log, and a batch is acknowledged only once
 * the append holding it has succeeded (design §9.6).
 *
 * Seams for later tickets:
 * - #64 reconnects and snapshots: `snapshot()` and the `seq` already acknowledged in `receive`.
 */
export class Match {
  readonly matchId: string;
  readonly seed: number;
  readonly #players: Map<string, Player>;
  readonly #output: MatchOutput;
  readonly #clock: MatchClock;
  #ended = false;
  /** Draws the targets of FFA attacks (design §8.5). */
  readonly #rng: MatchRng;
  /** The id of the next attack routed. */
  #nextGarbageId = 1;
  readonly #log: MatchLogWriter;

  constructor({
    matchId,
    mode,
    seed,
    players,
    clock,
    startAt,
    output,
    epoch,
    log,
    logger,
  }: MatchOptions) {
    this.matchId = matchId;
    this.seed = seed;
    this.#output = output;
    this.#clock = new MatchClock(clock, startAt);
    this.#rng = createMatchRng(seed);
    this.#log = new MatchLogWriter({
      matchId,
      epoch,
      log,
      logger,
      start: {
        seed,
        settings: PLAY_SETTINGS[mode],
        players: players.map(({ id, nickname }, index) => ({ id, nickname, index })),
      },
      logged: (playerId, seq) => this.#output.toPlayer(playerId, { type: 'batchAck', seq }),
    });
    this.#players = new Map(
      players.map(({ id }, index) => [
        id,
        {
          id,
          index,
          engine: createEngine(PLAY_SETTINGS[mode], seed, index),
          nextSeq: 0,
          frame: 0,
          unrelayed: [],
          out: null,
          linesSent: 0,
          holes: holeSeeds.create(seed, index),
          incoming: new IncomingGarbage(),
        },
      ]),
    );
    for (const player of this.#players.values()) {
      this.#clock.watch(
        () => (player.out ? null : player.frame),
        (frame) => this.goOut(player.id, 'laggedOut', frame),
      );
    }
  }

  /** The players by index, as `countdown` lists them. */
  get players(): { id: string; index: number }[] {
    return [...this.#players.values()].map(({ id, index }) => ({ id, index }));
  }

  get ended(): boolean {
    return this.#ended;
  }

  has(playerId: string): boolean {
    return this.#players.has(playerId);
  }

  /** Each player's game as verified so far. */
  verifiedGames(): VerifiedGame[] {
    return [...this.#players.values()].map(({ id, frame, engine }) => ({
      playerId: id,
      frame,
      hash: engine.hash(),
    }));
  }

  /**
   * An input batch from `playerId`: verified by replaying it on their engine, queued for the next
   * relay and the next match-log append, and acknowledged once that append has succeeded. A batch
   * that doesn't follow on from the last one, receives garbage it wasn't sent, or that the engine
   * refuses, removes the player at its first frame (design §10.1).
   */
  receive(playerId: string, { seq, frames }: ClientMessageOf<'inputBatch'>): void {
    const player = this.#players.get(playerId);
    if (!player || player.out || this.#ended) return;
    // A batch sent again after a reconnect (#64) has been verified already: ack it again.
    if (seq < player.nextSeq) {
      this.#acknowledge(player, seq);
      return;
    }
    const first = frames[0]?.frame ?? player.frame + 1;
    if (seq !== player.nextSeq || !this.#follows(player, frames)) {
      this.goOut(playerId, 'removed', first);
      return;
    }
    if (!this.#checkClock(player, frames)) return;
    const actions: Action[] = frames.flatMap((entry) => entry.actions);
    if (!this.#checkGarbage(player, actions)) {
      this.goOut(playerId, 'removed', first);
      return;
    }
    const last = frames.at(-1)?.frame ?? player.frame;
    let laggedOut: number | null;
    try {
      laggedOut = this.#play(player, last, actions);
    } catch {
      this.goOut(playerId, 'removed', first);
      return;
    }
    // A game over, or a lag-out, stops the engine where it ended: frames after it never happened.
    player.frame = player.engine.state.frame;
    const verified = frames.filter(({ frame }) => frame <= player.frame);
    player.unrelayed.push(...verified);
    player.nextSeq = seq + 1;
    this.#log.batch({ playerId, seq, frames: verified });
    if (laggedOut !== null) this.goOut(playerId, 'laggedOut', laggedOut);
    else if (player.engine.state.toppedOut) this.goOut(playerId, 'toppedOut', player.frame);
    else this.#settle();
  }

  /**
   * Appends the batches verified and the garbage routed since the last append to the match log,
   * every 100 ms (design §9.6). Each batch is acknowledged once its append has succeeded.
   */
  appendLog(): void {
    this.#log.append();
  }

  /** Relays the frames verified since the last tick, one `relay` per player (design §8.1). */
  tick(): void {
    for (const player of this.#players.values()) this.#relay(player);
  }

  /**
   * `playerId` leaves the match (`leaveRoom`, or `leaveMatch` to watch the rest): out with `left`
   * at their last verified frame (design §10.1).
   */
  leave(playerId: string): void {
    const player = this.#players.get(playerId);
    if (player) this.goOut(playerId, 'left', player.frame);
  }

  /** Stops the match's timers, as its room stops it before it ends, and deletes its log. */
  stop(): void {
    this.#clock.stop();
    if (!this.#ended) this.#log.finish().catch(() => {});
  }

  /**
   * Takes `playerId` out of the match at `frame`, as the replay topped them out, they left, they
   * lagged out or their batch was refused. Announced at once (`playerOut`).
   */
  goOut(playerId: string, reason: OutReason, frame: number): void {
    const player = this.#players.get(playerId);
    if (!player || player.out || this.#ended) return;
    this.#relay(player);
    player.out = { reason, frame };
    this.#output.toRoom({ type: 'playerOut', playerId, reason, frame });
    this.#settle();
  }

  /** Whether `frames` start at the frame after the last one verified and run on without a gap. */
  #follows(player: Player, frames: readonly FrameActions[]): boolean {
    return frames.every(({ frame }, offset) => frame === player.frame + 1 + offset);
  }

  /**
   * Whether the batch keeps to the server's clock (design §8.4), and if not, takes the player out:
   * lagged out at their last verified frame if they were already more than 3 s behind when it
   * came (the lag-out timer is due, or late), removed at the batch's first frame if it runs more
   * than `CLOCK_LEAD_TOLERANCE` frames ahead of the expected frame.
   */
  #checkClock(player: Player, frames: readonly FrameActions[]): boolean {
    if (this.#clock.laggedOut(player.frame)) {
      this.goOut(player.id, 'laggedOut', player.frame);
      return false;
    }
    const first = frames[0]?.frame ?? player.frame + 1;
    if (this.#clock.tooFarAhead(frames.at(-1)?.frame ?? player.frame)) {
      this.goOut(player.id, 'removed', first);
      return false;
    }
    return true;
  }

  /**
   * Whether the batch's `garbageReceived` actions name attacks the server sent this player and
   * they haven't received yet, with the lines and hole seeds sent (design §8.5, step 4).
   */
  #checkGarbage(player: Player, actions: readonly Action[]): boolean {
    return player.incoming.receive(actions);
  }

  /**
   * Replays `actions` on the player's engine up to `last`, routing the garbage it sends as it
   * goes, and stopping at the frame an attack's `GARBAGE_ACK_TIMEOUT` runs out at if it hasn't
   * been received and accepted by then (design §8.5, step 7): that frame, the player's lag-out,
   * or `null`.
   */
  #play(player: Player, last: number, actions: readonly Action[]): number | null {
    let done = player.engine.state.frame;
    for (const cut of [...player.incoming.deadlines(done, last), last]) {
      if (cut <= done) continue;
      const from = done;
      const { sent } = player.engine.step(
        cut,
        actions.filter(({ frame }) => frame > from && frame <= cut),
      );
      done = cut;
      this.#routeGarbage(player, sent);
      const { frame, garbageMeter } = player.engine.state;
      const overdue = player.incoming.overdue(frame, garbageMeter);
      if (overdue) return overdue.sentAt + GARBAGE_ACK_TIMEOUT;
    }
    return null;
  }

  /**
   * Sends the garbage a verified batch sent on (design §8.5, steps 1 and 2): to the opponent, or in
   * an FFA a random player not yet declared out, with `garbageQueued` to the room, onto the
   * target's sent-not-received list and into the match log. With no one left to aim at it's lost.
   */
  #routeGarbage(player: Player, sent: readonly SentGarbage[]): void {
    for (const { lines } of sent) {
      player.linesSent += lines;
      const candidates = [...this.#players.values()].filter(
        (other) => other !== player && other.out === null,
      );
      const target = chooseTarget(this.#rng, candidates);
      if (!target) continue;
      const id = this.#nextGarbageId++;
      const holeSeed = holeSeeds.next(target.holes);
      target.incoming.send({ id, lines, holeSeed, sentAt: target.frame });
      this.#log.routing({
        from: player.id,
        to: target.id,
        id,
        lines,
        holeSeed,
        frame: target.frame,
      });
      this.#output.toRoom({
        type: 'garbageQueued',
        id,
        from: player.id,
        to: target.id,
        lines,
        holeSeed,
      });
    }
  }

  /**
   * Acknowledges a batch sent again that has been verified already, if it's in the match log. If
   * it isn't yet, the append that holds it acknowledges it (design §9.6).
   */
  #acknowledge(player: Player, seq: number): void {
    if (this.#log.isLogged(player.id, seq)) {
      this.#output.toPlayer(player.id, { type: 'batchAck', seq });
    }
  }

  #relay(player: Player): void {
    if (player.unrelayed.length === 0) return;
    const frames = player.unrelayed;
    player.unrelayed = [];
    this.#output.toOthers(player.id, { type: 'relay', playerId: player.id, frames });
  }

  /**
   * Ends the match once at most one player is still in and every player still in has been
   * verified up to the last frame anyone went out at, so a late batch can't change who outlasted
   * whom (design §10.1, Placements by frame).
   */
  #settle(): void {
    const players = [...this.#players.values()];
    const still = players.filter(({ out }) => out === null);
    if (still.length > 1) return;
    const lastOut = Math.max(0, ...players.map(({ out }) => out?.frame ?? 0));
    if (still.some(({ frame }) => frame < lastOut)) return;
    this.tick();
    this.#ended = true;
    this.#clock.stop();
    this.#log.finish().catch(() => {});
    const result: ServerMessageOf<'matchEnd'> = {
      type: 'matchEnd',
      placements: placements(players),
      stats: players.map(statsOf),
    };
    this.#output.toRoom(result);
    this.#output.ended(result);
  }
}

/**
 * Places by the frame each player went out at, later being better, and players still in first
 * (design §10.1). Players out at the same frame share a place, and the place after a tie skips
 * the places the tie took.
 */
function placements(players: readonly Player[]): ServerMessageOf<'matchEnd'>['placements'] {
  // A player still in outlasted everyone who went out.
  const reached = (player: Player) => player.out?.frame ?? Number.POSITIVE_INFINITY;
  return players
    .map((player) => {
      const place = 1 + players.filter((other) => reached(other) > reached(player)).length;
      const { out } = player;
      return { playerId: player.id, place, ...(out && { reason: out.reason, frame: out.frame }) };
    })
    .sort((a, b) => a.place - b.place);
}

/** Two decimals, which is all the results show. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Lines sent, attack per minute and pieces per second over the frames the player played. */
function statsOf({ id, engine, linesSent }: Player): ServerMessageOf<'matchEnd'>['stats'][number] {
  const { frame, piecesPlaced } = engine.state;
  const minutes = frame / 3600;
  return {
    playerId: id,
    linesSent,
    apm: minutes > 0 ? round(linesSent / minutes) : 0,
    pps: frame > 0 ? round((piecesPlaced * 60) / frame) : 0,
  };
}
