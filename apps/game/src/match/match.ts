import {
  type Action,
  ActionType,
  createEngine,
  type Engine,
  FFA,
  type ModeSettings,
  ONE_VS_ONE,
} from '@shura/engine';
import type {
  ClientData,
  FrameActions,
  OutReason,
  RoomMode,
  ServerData,
  ServerMessage,
} from '@shura/protocol';
import type { Clock } from '../clock';
import { MatchClock } from './match-clock';
import { type MatchPlayer, placements, statsOf } from './results';

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
}

/**
 * A match on the server (design §8.1): one engine per player, each verified by replaying that
 * player's input batches, acknowledged and relayed to the room per tick, with players going out
 * when the replay tops them out, they fall behind or run ahead of the server's clock (design §8.4),
 * or they leave, and the placements once it's settled.
 *
 * Seams for later issues:
 * - #62 garbage routing and the match log: `#checkGarbage`, `#routeGarbage`, and acknowledging only
 *   after the log append that holds the batch (`#acknowledge`);
 * - #64 reconnects: a batch sent again is acknowledged again (`receive`), snapshots of the engines.
 */
export class Match {
  readonly matchId: string;
  readonly seed: number;
  readonly #players: Map<string, Player>;
  readonly #output: MatchOutput;
  readonly #clock: MatchClock;
  #ended = false;

  constructor({ matchId, mode, seed, players, clock, startAt, output }: MatchOptions) {
    this.matchId = matchId;
    this.seed = seed;
    this.#output = output;
    this.#clock = new MatchClock(clock, startAt);
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
   * An input batch from `playerId`: verified by replaying it on their engine, acknowledged, and
   * queued for the next relay. A batch that doesn't follow on from the last one, or that the
   * engine refuses, removes the player at its first frame (design §10.1).
   */
  receive(
    playerId: string,
    { seq, frames }: Pick<ClientData<'inputBatch'>, 'seq' | 'frames'>,
  ): void {
    const player = this.#players.get(playerId);
    if (!player || player.out || this.#ended) return;
    // A batch sent again (after a reconnect, #64) has been verified already: ack it again.
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
    try {
      const { sent } = player.engine.step(last, actions);
      this.#routeGarbage(player, sent);
    } catch {
      this.goOut(playerId, 'removed', first);
      return;
    }
    // A game over stops the engine where it ended: frames after it never happened.
    player.unrelayed.push(...frames.filter(({ frame }) => frame <= player.frame));
    player.nextSeq = seq + 1;
    this.#acknowledge(player, seq);
    if (player.engine.state.toppedOut) this.goOut(playerId, 'toppedOut', player.frame);
    else this.#settle();
  }

  /** Relays the frames verified since the last tick, one `relay` per player (design §8.1). */
  tick(): void {
    for (const player of this.#players.values()) this.#relay(player);
  }

  /** Stops the match's timers, as its room stops it before it ends. */
  stop(): void {
    this.#clock.stop();
  }

  /** `playerId` leaves the match: out with `left` at their last verified frame (design §10.1). */
  leave(playerId: string): void {
    const player = this.#players.get(playerId);
    if (player) this.goOut(playerId, 'left', player.frame);
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
   * Whether the batch's `garbageReceived` actions name attacks the server sent this player (design
   * §8.5, step 4). Nothing is routed until #62, so none can be right yet.
   */
  #checkGarbage(_player: Player, actions: readonly Action[]): boolean {
    return actions.every(({ type }) => type !== ActionType.GarbageReceived);
  }

  /**
   * The garbage a verified batch sent (design §8.5). #62 routes it to a target with
   * `garbageQueued`; until then it only counts towards the stats.
   */
  #routeGarbage(player: Player, sent: readonly { lines: number }[]): void {
    for (const { lines } of sent) player.linesSent += lines;
  }

  /**
   * Acknowledges a verified batch. #62 moves this to after the match-log append that holds it
   * (design §9.6).
   */
  #acknowledge(player: Player, seq: number): void {
    this.#output.toPlayer(player.id, { event: 'batchAck', data: { seq } });
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
    const result: ServerData<'matchEnd'> = {
      placements: placements(players),
      stats: players.map((player) => statsOf(player, player.engine.state.piecesPlaced)),
    };
    this.#output.toRoom({ event: 'matchEnd', data: result });
    this.#output.ended(result);
  }
}
