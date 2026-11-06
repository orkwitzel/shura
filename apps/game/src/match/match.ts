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
import { MatchLogWriter } from '../match-log';
import { IncomingGarbage } from './incoming-garbage';
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
 * tops them out or they leave, and the placements once it's settled.
 *
 * Garbage goes from attacker to target as the server verifies it (design §8.5): routed with
 * `garbageQueued`, checked when the target's batches receive it, and timed until they accept it.
 * Every verified batch and routing goes into the match log, and a batch is acknowledged only once
 * the append holding it has succeeded (design §9.6).
 *
 * Seams for later issues:
 * - #63 clock enforcement: `#checkClock`, and lag-outs through `goOut`;
 * - #64 reconnects: a batch sent again is acknowledged again (`receive`), snapshots of the engines,
 *   and the attacks a player came back without (`IncomingGarbage.unreceived`).
 */
export class Match {
  readonly matchId: string;
  readonly seed: number;
  readonly #players: Map<string, Player>;
  readonly #output: MatchOutput;
  #ended = false;
  /** Draws the targets of FFA attacks (design §8.5). */
  readonly #rng: MatchRng;
  /** The id of the next attack routed. */
  #nextGarbageId = 1;
  readonly #log: MatchLogWriter;

  constructor({ matchId, mode, seed, players, output, epoch, log, logger }: MatchOptions) {
    this.matchId = matchId;
    this.seed = seed;
    this.#output = output;
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

  /** `playerId` leaves the match: out with `left` at their last verified frame (design §10.1). */
  leave(playerId: string): void {
    const player = this.#players.get(playerId);
    if (player) this.goOut(playerId, 'left', player.frame);
  }

  /** The room stops the match before it has ended (it emptied, or closed): its log is deleted. */
  stop(): void {
    if (!this.#ended) this.#finishLog();
  }

  /**
   * Takes `playerId` out of the match at `frame`, as the replay topped them out, they left, their
   * batch was refused, or they didn't accept an attack in time (and, from #63, as they fell
   * behind). Announced at once (`playerOut`).
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
   * Whether the batch's frames are on time (design §8.4). Always, until #63 enforces the 1 s
   * window and `CLOCK_LEAD_TOLERANCE`, and lags out or removes the player itself when they aren't.
   */
  #checkClock(_player: Player, _frames: readonly FrameActions[]): boolean {
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
    this.#finishLog();
    const result: ServerData<'matchEnd'> = {
      placements: placements(players),
      stats: players.map((player) => statsOf(player, player.engine.state.piecesPlaced)),
    };
    this.#output.toRoom({ event: 'matchEnd', data: result });
    this.#output.ended(result);
  }
}
