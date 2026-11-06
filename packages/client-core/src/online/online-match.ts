import {
  type Action,
  createEngine,
  type Engine,
  type EngineEvent,
  FFA,
  type ModeSettings,
  ONE_VS_ONE,
  type PieceAction,
  type PieceActionType,
  type ReadonlyEngineState,
} from '@shura/engine';
import {
  BATCH_FRAMES,
  frameAt,
  type OutReason,
  type RoomMode,
  type ServerData,
} from '@shura/protocol';
import type { InputEngine, KeyEvent } from '../input/input-engine';
import type { Clock } from '../shared/clock';
import { placeOf } from '../view/places';

/** The engine settings of each room mode (design §4): an FFA plays by 1v1's rules. */
export const MATCH_SETTINGS: Readonly<Record<RoomMode, ModeSettings>> = {
  '1v1': ONE_VS_ONE,
  ffa: FFA,
};

/**
 * The lines of garbage attacks hold together: a step's attacks sent, or those waiting in a garbage
 * meter (the meter's height, design §13.2).
 */
export function totalLines(attacks: readonly { readonly lines: number }[]): number {
  return attacks.reduce((sum, { lines }) => sum + lines, 0);
}

/** How a player went out of the match, and at which frame (design §10.1). */
export interface PlayerOut {
  readonly reason: OutReason;
  readonly frame: number;
}

/** One player's game in an online match: yours, or an opponent's as relayed (design §8.6). */
export interface OnlinePlayerGame {
  readonly playerId: string;
  /** Their index in the match, which seeds their engine. */
  readonly index: number;
  /** Their game, live: your own engine, or the one fed from their relays. */
  readonly engine: ReadonlyEngineState;
  /** Set once the server says they're out (`playerOut`). */
  readonly out: PlayerOut | null;
  /**
   * The garbage lines their locks have sent on, after cancelling their own meter, as this client
   * played or relayed them (the HUD's lines sent).
   */
  readonly linesSent: number;
}

/** A player in the match's roster: who they are, and once out, how, when and their place. */
export interface RosterEntry {
  readonly playerId: string;
  readonly out: PlayerOut | null;
  /** Their place so far (`placeOf`), and the server's once the match has ended: `null` while in. */
  readonly place: number | null;
}

/**
 * Where a match is: counting down to Go, playing, or ended (`matchEnd`). Being out yourself is
 * `out` on your own game: the match plays on around you.
 */
export type OnlineMatchPhase = 'countdown' | 'playing' | 'ended';

export interface OnlineMatchState {
  readonly matchId: string;
  readonly seed: number;
  readonly mode: RoomMode;
  readonly phase: OnlineMatchPhase;
  /** During the countdown, the frames left before Go. Otherwise 0. */
  readonly countdown: number;
  /** Your session id, if you play in this match; `null` if you watch it. */
  readonly playerId: string | null;
  /** Every player's game, in index order. */
  readonly players: readonly OnlinePlayerGame[];
  /** Your own game: the one of `players` that is yours, or `null` if you watch. */
  readonly me: OnlinePlayerGame | null;
  /**
   * Every player in index order, with how they went out and their place. It is a new array only
   * when someone goes out or the match ends, so a UI that shows names and places can select it
   * without re-rendering every frame.
   */
  readonly roster: readonly RosterEntry[];
  /** The placements and stats, once it has ended. */
  readonly result: ServerData<'matchEnd'> | null;
}

/** One frame of your game as an input batch lists it: every action carries the frame. */
export interface BatchFrame {
  readonly frame: number;
  readonly actions: readonly Action[];
}

/** An input batch (design §8.1): your frames since the last one, numbered by `seq` from 0. */
export interface InputBatch {
  readonly seq: number;
  readonly frames: readonly BatchFrame[];
}

export interface OnlineMatchOptions {
  readonly clock: Clock;
  readonly mode: RoomMode;
  readonly countdown: ServerData<'countdown'>;
  /** Your session id: you play if the countdown lists it. */
  readonly playerId: string;
  /** The clock's time at the start of frame 0: `startAt − offset` (design §8.4). */
  readonly start: number;
  readonly input: InputEngine;
  /** Sends one input batch. */
  readonly send: (batch: InputBatch) => void;
  /** The state changed: the session republishes it. */
  readonly changed: () => void;
  /** The engine events and applied actions of your own game, after each wake that had any. */
  readonly heard: (events: readonly EngineEvent[], actions: readonly PieceAction[]) => void;
}

const NO_WAKE = (): void => {};

interface Game {
  readonly playerId: string;
  readonly index: number;
  readonly engine: Engine;
  out: PlayerOut | null;
  linesSent: number;
}

/**
 * An online match on the client (design §13.1, Online session): your own game run by the same
 * kind of loop as a single-player session from `startAt − offset`, sent as input batches about
 * every 3 frames and kept until acknowledged, and every opponent's game fed from relays.
 *
 * The loop never pauses (design §8.4): a late wake steps every frame it missed, as the server's
 * clock kept running, and it stops only once your game is over or the match has ended.
 *
 * Seams for later issues: garbage aimed at you enters `#playFrame` as `garbageReceived` actions
 * (#62); `unacknowledged` is what a reconnect sends again, and a snapshot restores the games (#64).
 */
export class OnlineMatch {
  readonly #options: OnlineMatchOptions;
  readonly #games: Game[];
  readonly #me: Game | undefined;
  /** The last frame the loop has reached, the countdown's (from 0 down) included. */
  #frame: number;
  /** Cancels the wake waiting, or `NO_WAKE` when none is. */
  #cancelWake: () => void = NO_WAKE;
  /** Relays have changed the games since the state was last published. */
  #dirty = false;
  #phase: OnlineMatchPhase;
  #result: ServerData<'matchEnd'> | null = null;
  #roster: readonly RosterEntry[];
  /** Atomic actions waiting for their frame, in frame order. */
  #pending: PieceAction[] = [];
  /** Key events waiting for their frame, in frame order. */
  #keys: { event: KeyEvent; frame: number }[] = [];
  /** Your frames played but not yet sent. */
  #unsent: BatchFrame[] = [];
  /** Batches sent and not yet acknowledged, oldest first. */
  #unacknowledged: InputBatch[] = [];
  #nextSeq = 0;
  #unheardEvents: EngineEvent[] = [];
  #unheardActions: PieceAction[] = [];

  constructor(options: OnlineMatchOptions) {
    this.#options = options;
    const { mode, countdown, playerId, clock } = options;
    this.#games = [...countdown.players]
      .sort((a, b) => a.index - b.index)
      .map(({ id, index }) => ({
        playerId: id,
        index,
        engine: createEngine(MATCH_SETTINGS[mode], countdown.seed, index),
        out: null,
        linesSent: 0,
      }));
    this.#me = this.#games.find((game) => game.playerId === playerId);
    this.#roster = this.#rosterNow();
    // A countdown that arrived late starts at the frame its time has reached.
    this.#frame = Math.min(frameAt(clock.now() - options.start), 0);
    this.#phase = this.#frame < 0 ? 'countdown' : 'playing';
    if (this.#me) this.#schedule();
  }

  get matchId(): string {
    return this.#options.countdown.matchId;
  }

  /** Batches sent and not yet acknowledged, to send again after a reconnect. */
  get unacknowledged(): readonly InputBatch[] {
    return this.#unacknowledged;
  }

  /** An action that arrived at `time`, applied at the first frame that starts after it. */
  act(type: PieceActionType, time: number): void {
    if (this.#over()) return;
    const last = this.#pending.at(-1)?.frame ?? 0;
    const frame = Math.max(this.#frameAfter(time), this.#myEngine().state.frame + 1, last);
    this.#pending.push({ frame, type });
  }

  /** A key event, for the input engine at the first frame that starts after it. */
  key(event: KeyEvent): void {
    if (this.#over()) return;
    const last = this.#keys.at(-1)?.frame ?? Number.NEGATIVE_INFINITY;
    const frame = Math.max(this.#frameAfter(event.time), this.#frame + 1, last);
    this.#keys.push({ event, frame });
  }

  /** `batchAck`: the batches up to `seq` are verified, so they needn't be kept. */
  acknowledge(seq: number): void {
    this.#unacknowledged = this.#unacknowledged.filter((batch) => batch.seq > seq);
  }

  /**
   * `relay`: an opponent's verified frames, played on their engine (design §8.6). The state goes
   * out at the next wake, with your own frames, so a burst of relays is one publish.
   */
  relay({ playerId, frames }: ServerData<'relay'>): void {
    const game = this.#games.find((other) => other.playerId === playerId);
    if (!game || game === this.#me) return;
    const reached = game.engine.state.frame;
    const fresh = frames.filter(({ frame }) => frame > reached);
    const last = fresh.at(-1)?.frame;
    if (last === undefined) return;
    // Someone watching has no loop of their own: the first relay says play has started.
    if (this.#phase === 'countdown') this.#phase = 'playing';
    const { sent } = game.engine.step(
      last,
      fresh.flatMap((entry) => entry.actions),
    );
    game.linesSent += totalLines(sent);
    this.#dirty = true;
    this.#schedule();
  }

  /**
   * `playerOut`. Once you're out yourself, your loop stops and nothing you kept is sent: you watch
   * the rest (design §10.1).
   */
  playerOut({ playerId, reason, frame }: ServerData<'playerOut'>): void {
    const game = this.#games.find((other) => other.playerId === playerId);
    if (!game) return;
    game.out = { reason, frame };
    this.#roster = this.#rosterNow();
    if (game === this.#me) {
      this.stop();
      this.#unsent = [];
      this.#unacknowledged = [];
    }
    this.#changed();
  }

  /** `matchEnd`: the loop stops where it is. */
  end(result: ServerData<'matchEnd'>): void {
    this.#result = result;
    this.#phase = 'ended';
    this.#roster = this.#rosterNow();
    this.stop();
    this.#changed();
  }

  /** Stops the loop, as the match ends or the player leaves. */
  stop(): void {
    this.#cancelWake();
    this.#cancelWake = NO_WAKE;
    this.#dirty = false;
  }

  snapshot(): OnlineMatchState {
    const { countdown } = this.#options;
    const players = this.#games.map(({ playerId, index, engine, out, linesSent }) => ({
      playerId,
      index,
      engine: engine.state,
      out,
      linesSent,
    }));
    return {
      matchId: countdown.matchId,
      seed: countdown.seed,
      mode: this.#options.mode,
      phase: this.#phase,
      countdown: this.#phase === 'countdown' ? -this.#frame : 0,
      playerId: this.#me?.playerId ?? null,
      players,
      me: players.find(({ playerId }) => playerId === this.#me?.playerId) ?? null,
      roster: this.#roster,
      result: this.#result,
    };
  }

  #rosterNow(): readonly RosterEntry[] {
    const match = { players: this.#games, result: this.#result };
    return this.#games.map(({ playerId, out }) => ({
      playerId,
      out,
      place: placeOf(match, playerId),
    }));
  }

  /** Wakes the loop soon, unless a wake is already waiting. */
  #schedule(): void {
    if (this.#cancelWake !== NO_WAKE) return;
    this.#cancelWake = this.#options.clock.schedule(this.#wake);
  }

  /**
   * Plays the frames the clock has reached, sends what's due, and publishes once for the frames
   * played and the relays heard since the last wake. The loop wakes again while your game is on.
   */
  #wake = (): void => {
    this.#cancelWake = NO_WAKE;
    const before = this.#frame;
    const now = frameAt(this.#options.clock.now() - this.#options.start);
    while (this.#frame < now && !this.#over()) this.#playFrame(this.#frame + 1);
    if (this.#unsent.length >= BATCH_FRAMES || (this.#over() && this.#unsent.length > 0)) {
      this.#sendBatch();
    }
    if (!this.#over()) this.#schedule();
    if (this.#frame > before || this.#dirty) this.#publish();
  };

  /**
   * Plays one frame: the input engine's, and from frame 1 your engine's, with the actions the
   * input engine makes in it, accepting garbage as a client does (design §8.5).
   */
  #playFrame(frame: number): void {
    this.#frame = frame;
    if (frame >= 0) this.#phase = 'playing';
    let keys = 0;
    while ((this.#keys[keys]?.frame ?? Number.POSITIVE_INFINITY) <= frame) keys++;
    const keyEvents = this.#keys.splice(0, keys).map(({ event }) => event);
    const engine = this.#myEngine();
    const emitted = this.#options.input.playFrame(keyEvents, frame > 0 ? engine.state : null);
    if (frame <= 0) return;
    let due = 0;
    while (this.#pending[due]?.frame === frame) due++;
    const moves = this.#pending.splice(0, due);
    for (const type of emitted) moves.push({ frame, type });
    const { events, accepted, sent } = engine.step(frame, moves, { acceptGarbage: true });
    if (this.#me) this.#me.linesSent += totalLines(sent);
    const actions: Action[] = [...moves, ...accepted];
    this.#unsent.push({ frame, actions });
    this.#unheardActions.push(...moves);
    this.#unheardEvents.push(...events);
  }

  #sendBatch(): void {
    const batch: InputBatch = { seq: this.#nextSeq++, frames: this.#unsent };
    this.#unsent = [];
    this.#unacknowledged.push(batch);
    this.#options.send(batch);
  }

  #publish(): void {
    this.#changed();
    if (this.#unheardEvents.length === 0 && this.#unheardActions.length === 0) return;
    const events = this.#unheardEvents;
    const actions = this.#unheardActions;
    this.#unheardEvents = [];
    this.#unheardActions = [];
    this.#options.heard(events, actions);
  }

  /** Publishes the state now, relays heard so far included. */
  #changed(): void {
    this.#dirty = false;
    this.#options.changed();
  }

  /** The first frame that starts after `time`. */
  #frameAfter(time: number): number {
    return frameAt(time - this.#options.start) + 1;
  }

  /**
   * Whether your own game is over: topped out, out as the server said (`playerOut`: you watch the
   * rest), or there is none (you watch).
   */
  #over(): boolean {
    const engine = this.#me?.engine.state;
    return (
      !engine ||
      engine.toppedOut ||
      engine.finished ||
      this.#me?.out != null ||
      this.#phase === 'ended'
    );
  }

  #myEngine(): Engine {
    if (!this.#me) throw new Error('watching a match: there is no game of your own');
    return this.#me.engine;
  }
}
