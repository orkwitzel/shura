import {
  type Action,
  createEngine,
  type Engine,
  FFA,
  type HoleSeedsState,
  holeSeeds,
  type ModeSettings,
  ONE_VS_ONE,
  type SentGarbage,
} from '@shura/engine';
import {
  type ClientData,
  type FrameActions,
  GARBAGE_ACK_TIMEOUT,
  type OutReason,
  type RoomMode,
  type ServerData,
  type ServerMessage,
} from '@shura/protocol';
import type { MatchLog } from '@shura/valkey';
import type { Logger } from 'pino';
import type { Clock } from '../clock';
import { MatchLogWriter } from '../match-log';
import { IncomingGarbage } from './incoming-garbage';
import { MatchClock } from './match-clock';
import { type MatchPlayer, placements, statsOf } from './results';
import { chooseTarget, createMatchRng, type MatchRng } from './targeting';

/** The engine settings of each room mode (design §4): an FFA plays by 1v1's rules. */
export const MATCH_SETTINGS: Readonly<Record<RoomMode, ModeSettings>> = {
  '1v1': ONE_VS_ONE,
  ffa: FFA,
};

/** Where a match's messages go: the room decides who is in it. */
export interface MatchOutput {
  /** To one player's client. */
  toPlayer(playerId: string, message: ServerMessage): void;
  /** To everyone in the room but `playerId`: the other players and the spectators. */
  toOthers(playerId: string, message: ServerMessage): void;
  /** To everyone in the room. */
  toRoom(message: ServerMessage): void;
  /** The match has ended and `matchEnd` has gone out. */
  ended(result: ServerData<'matchEnd'>): void;
}

export interface MatchOptions {
  readonly matchId: string;
  readonly mode: RoomMode;
  readonly seed: number;
  /** The players' ids in match order: each one's position is their index, which seeds their engine. */
  readonly players: readonly string[];
  /** The server's clock, which the players' batches must keep up with (design §8.4). */
  readonly clock: Clock;
  /** Server time at the start of frame 0: the countdown's `startAt`. */
  readonly startAt: number;
  readonly output: MatchOutput;
  /** The room's ownership epoch, which tags the match log's appends (design §9.3). */
  readonly epoch: number;
  /** Where the match log goes (design §9.6). */
  readonly log: MatchLog;
  /** The match's own logger. */
  readonly logger: Logger;
}

/** A player's game as the server verified it (design §14): what clients' hashes are checked against. */
export interface VerifiedGame {
  readonly playerId: string;
  /** The last frame verified. */
  readonly frame: number;
  /** The engine's hash at that frame. */
  readonly hash: string;
}

/** One player of a match: the server's copy of their game. */
interface Player extends MatchPlayer {
  readonly engine: Engine;
  /** The `seq` the next input batch must have. */
  nextSeq: number;
  /** Verified frames not yet relayed to the room. */
  unrelayed: FrameActions[];
  /** Their garbage RNG, which deals the hole seeds of the attacks sent to them (design §3). */
  readonly holes: HoleSeedsState;
  /** The attacks sent to them and not yet received and accepted (design §8.5). */
  readonly incoming: IncomingGarbage;
}

/**
 * A match on the server (design §8.1): one engine per player, each verified by replaying that
 * player's input batches, relayed to the room per tick, with players going out when the replay
 * tops them out, they fall behind or run ahead of the server's clock (design §8.4), or they leave,
 * and the placements once it's settled.
 *
 * Garbage goes from attacker to target as the server verifies it (design §8.5): routed with
 * `garbageQueued`, checked when the target's batches receive it, and timed until they accept it.
 * Every verified batch and routing goes into the match log, and a batch is acknowledged only once
 * the append holding it has succeeded (design §9.6).
 *
 * A player coming back mid-match gets the snapshot, the outs and the attacks sent to them that
 * they hadn't received (`snapshot`, `outs`, `unreceivedGarbage`), and the batches they send again
 * are acknowledged again once logged (design §8.6, §10.2).
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
        settings: MATCH_SETTINGS[mode],
        players: players.map((id, index) => ({ id, index })),
      },
      logged: (playerId, seq) =>
        this.#output.toPlayer(playerId, { event: 'batchAck', data: { seq } }),
    });
    this.#players = new Map(
      players.map((id, index) => {
        const engine = createEngine(MATCH_SETTINGS[mode], seed, index);
        const player: Player = {
          id,
          index,
          engine,
          get frame() {
            return engine.state.frame;
          },
          nextSeq: 0,
          unrelayed: [],
          out: null,
          linesSent: 0,
          holes: holeSeeds.create(seed, index),
          incoming: new IncomingGarbage(),
        };
        return [id, player];
      }),
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
   * Every player's game at their own last verified frame (design §8.6): what someone joining or
   * coming back mid-match restores, then plays each player's relays on from.
   */
  snapshot(): ServerMessage {
    return {
      event: 'snapshot',
      data: {
        players: [...this.#players.values()].map(({ id, frame, engine }) => ({
          playerId: id,
          frame,
          state: engine.serialize(),
        })),
      },
    };
  }

  /** A `playerOut` for each player already out, for someone joining or coming back (§8.6). */
  outs(): ServerMessage[] {
    return [...this.#players.values()].flatMap(({ id, out }) =>
      out ? [{ event: 'playerOut' as const, data: { playerId: id, ...out } }] : [],
    );
  }

  /**
   * The attacks sent to `playerId` that none of their verified batches has received yet, oldest
   * first, as the `garbageQueued` sent again when they come back mid-match: one sent while they
   * were away must still reach them (design §8.5, §8.6). Their client ignores any it already has.
   */
  unreceivedGarbage(playerId: string): ServerMessage[] {
    const player = this.#players.get(playerId);
    if (!player || player.out) return [];
    return player.incoming.unreceived().map(({ id, from, lines, holeSeed }) => ({
      event: 'garbageQueued' as const,
      data: { id, from, to: playerId, lines, holeSeed },
    }));
  }

  /**
   * An input batch from `playerId`: verified by replaying it on their engine, queued for the next
   * relay and the next match-log append, and acknowledged once that append has succeeded. A batch
   * that doesn't follow on from the last one, receives garbage it wasn't sent, or that the engine
   * refuses, removes the player at its first frame (design §10.1). One that runs past an attack's
   * `GARBAGE_ACK_TIMEOUT` without accepting it lags them out there (design §8.5).
   */
  receive(
    playerId: string,
    { seq, frames }: Pick<ClientData<'inputBatch'>, 'seq' | 'frames'>,
  ): void {
    const player = this.#players.get(playerId);
    if (!player || player.out || this.#ended) return;
    // A batch sent again (after a reconnect, #64) has been verified already: ack it again, once
    // it's in the log.
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
    const actions = frames.flatMap((entry) => entry.actions) as Action[];
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
   * which the room does every `MATCH_LOG_APPEND_MS` (design §9.6). Each batch is acknowledged once
   * its append has succeeded.
   */
  appendLog(): void {
    this.#log.append();
  }

  /** Relays the frames verified since the last tick, one `relay` per player (design §8.1). */
  tick(): void {
    for (const player of this.#players.values()) this.#relay(player);
  }

  /**
   * Stops the match's timers, as its room stops it. A match stopped before its end (the room
   * emptied, or closed) deletes its log too.
   */
  stop(): void {
    this.#clock.stop();
    if (!this.#ended) this.#finishLog();
  }

  /** `playerId` leaves the match: out with `left` at their last verified frame (design §10.1). */
  leave(playerId: string): void {
    const player = this.#players.get(playerId);
    if (player) this.goOut(playerId, 'left', player.frame);
  }

  /**
   * Takes `playerId` out of the match at `frame`, as the replay topped them out, they left, they
   * lagged out (behind the clock, or an attack not accepted in time) or their batch was refused.
   * Announced at once (`playerOut`).
   */
  goOut(playerId: string, reason: OutReason, frame: number): void {
    const player = this.#players.get(playerId);
    if (!player || player.out || this.#ended) return;
    this.#relay(player);
    player.out = { reason, frame };
    this.#output.toRoom({ event: 'playerOut', data: { playerId, reason, frame } });
    this.#settle();
  }

  /** Whether `frames` start at the frame after the last one verified and run on without a gap. */
  #follows(player: Player, frames: readonly FrameActions[]): boolean {
    return frames.every(({ frame }, offset) => frame === player.frame + 1 + offset);
  }

  /**
   * Whether the batch is on time (design §8.4), taking the player out if it isn't: lagged out at
   * their last verified frame if they were already more than 3 s behind when it came (the lag-out
   * timer is due, or late), and removed at its first frame if its last runs more than
   * `CLOCK_LEAD_TOLERANCE` frames ahead of the expected frame (a batch during the countdown does).
   */
  #checkClock(player: Player, frames: readonly FrameActions[]): boolean {
    if (this.#clock.laggedOut(player.frame)) {
      this.goOut(player.id, 'laggedOut', player.frame);
      return false;
    }
    const first = frames[0]?.frame ?? player.frame + 1;
    const last = frames.at(-1)?.frame ?? player.frame;
    if (this.#clock.tooFarAhead(last)) {
      this.goOut(player.id, 'removed', first);
      return false;
    }
    return true;
  }

  /**
   * Whether the batch's `garbageReceived` actions name attacks the server sent this player and
   * hasn't seen them receive yet, with the lines and hole seeds sent (design §8.5, step 4).
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
    let done = player.frame;
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
   * Sends on the garbage a verified batch sent (design §8.5, steps 1 and 2): to the opponent, or in
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
      const frame = target.frame;
      target.incoming.send({ id, from: player.id, lines, holeSeed, sentAt: frame });
      this.#log.routing({ from: player.id, to: target.id, id, lines, holeSeed, frame });
      this.#output.toRoom({
        event: 'garbageQueued',
        data: { id, from: player.id, to: target.id, lines, holeSeed },
      });
    }
  }

  /**
   * Acknowledges a batch sent again that has been verified already, if it's in the match log. If
   * it isn't yet, the append that holds it acknowledges it (design §9.6).
   */
  #acknowledge(player: Player, seq: number): void {
    if (this.#log.isLogged(player.id, seq)) {
      this.#output.toPlayer(player.id, { event: 'batchAck', data: { seq } });
    }
  }

  /** Appends what is left, then deletes the log, without waiting (design §9.6). */
  #finishLog(): void {
    this.#log.finish().catch(() => {});
  }

  #relay(player: Player): void {
    if (player.unrelayed.length === 0) return;
    const frames = player.unrelayed;
    player.unrelayed = [];
    this.#output.toOthers(player.id, { event: 'relay', data: { playerId: player.id, frames } });
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
    this.#finishLog();
    const result: ServerData<'matchEnd'> = {
      placements: placements(players),
      stats: players.map((player) => statsOf(player, player.engine.state.piecesPlaced)),
    };
    this.#output.toRoom({ event: 'matchEnd', data: result });
    this.#output.ended(result);
  }
}
