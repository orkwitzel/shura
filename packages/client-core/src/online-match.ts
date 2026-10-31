import {
  type Action,
  ActionType,
  createEngine,
  type Engine,
  type EngineEvent,
  FFA,
  type GarbageReceivedAction,
  ONE_VS_ONE,
  type PieceAction,
  type PieceActionType,
  type ReadonlyEngineState,
} from '@shura/engine';
import {
  BATCH_FRAMES,
  type ClientMessageOf,
  type OutReason,
  type RoomMode,
  type ServerMessageOf,
} from '@shura/protocol';
import type { Clock } from './clock';
import { frameAt } from './frames';
import type { InputEngine, KeyEvent } from './input-engine';

/** One frame's actions, as an input batch or a relay lists them. */
type FrameActions = ClientMessageOf<'inputBatch'>['frames'][number];

const PLAY_SETTINGS = { '1v1': ONE_VS_ONE, ffa: FFA } as const;

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
  /** The frame play starts at: always 0 online, as `countdownLabel` wants it. */
  readonly goFrame: 0;
  /** Your session id, if you play in this match; `null` if you watch it. */
  readonly playerId: string | null;
  /** Every player's game, in index order. */
  readonly players: readonly OnlinePlayerGame[];
  /** Your own actions, in order, as sent: your action log. */
  readonly actions: readonly Action[];
  /** The placements and stats, once it has ended. */
  readonly result: ServerMessageOf<'matchEnd'> | null;
}

export interface OnlineMatchOptions {
  readonly clock: Clock;
  readonly mode: RoomMode;
  readonly countdown: ServerMessageOf<'countdown'>;
  /** Your session id: you play if the countdown lists it. */
  readonly playerId: string;
  /** The clock's time at the start of frame 0: `startAt − offset` (design §8.4). */
  readonly start: number;
  readonly input: InputEngine;
  /** Sends one input batch. */
  readonly send: (batch: ClientMessageOf<'inputBatch'>) => void;
  /** The state changed: the session republishes it. */
  readonly changed: () => void;
  /** The engine events and applied actions of your own game, after each wake that had any. */
  readonly heard: (events: readonly EngineEvent[], actions: readonly PieceAction[]) => void;
}

interface Game {
  readonly playerId: string;
  readonly index: number;
  engine: Engine;
  out: PlayerOut | null;
}

/**
 * An online match on the client (design §13.1, Online session): your own game run by the same
 * kind of loop as a single-player session from `startAt − offset`, sent as input batches about
 * every 3 frames and kept until acknowledged, and every opponent's game fed from relays.
 *
 * The loop never pauses (design §8.4): a late wake steps every frame it missed, as the server's
 * clock kept running, and it stops only once your game is over or the match has ended.
 *
 * An attack the server routes to you (`garbageQueued`) enters your game as a `garbageReceived`
 * action at your next frame, before its other actions, and your engine accepts garbage as a
 * client does (design §8.5, ADR 0013).
 *
 * Seams for later tickets:
 * - #64: `unacknowledged` batches are resent after a reconnect, and `restore` restores the games
 *   from a snapshot.
 */
export class OnlineMatch {
  readonly #options: OnlineMatchOptions;
  readonly #games: Game[];
  readonly #me: Game | undefined;
  /** The last frame the loop has reached, the countdown's (from 0 down) included. */
  #frame: number;
  #cancelWake: () => void = () => {};
  #phase: OnlineMatchPhase;
  #result: ServerMessageOf<'matchEnd'> | null = null;
  /** Atomic actions waiting for their frame, in frame order. */
  #pending: PieceAction[] = [];
  /** Key events waiting for their frame, in frame order. */
  #keys: { event: KeyEvent; frame: number }[] = [];
  /** `garbageReceived` actions for your next frame, their frame still to be set. */
  #incoming: GarbageReceivedAction[] = [];
  /** Your frames played but not yet sent. */
  #unsent: FrameActions[] = [];
  /** Batches sent and not yet acknowledged, oldest first. */
  #unacknowledged: ClientMessageOf<'inputBatch'>[] = [];
  #nextSeq = 0;
  #log: Action[] = [];
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
        engine: createEngine(PLAY_SETTINGS[mode], countdown.seed, index),
        out: null,
      }));
    this.#me = this.#games.find((game) => game.playerId === playerId);
    // A countdown that arrived late starts at the frame its time has reached.
    this.#frame = Math.min(frameAt(clock.now() - options.start), 0);
    this.#phase = this.#frame < 0 ? 'countdown' : 'playing';
    if (this.#me) this.#cancelWake = clock.schedule(this.#wake);
  }

  /** Batches sent and not yet acknowledged, to send again after a reconnect (#64). */
  get unacknowledged(): readonly ClientMessageOf<'inputBatch'>[] {
    return this.#unacknowledged;
  }

  /** An action that arrived at `time`, applied at the first frame that starts after it. */
  act(type: PieceActionType, time: number): void {
    if (!this.#playing()) return;
    const last = this.#pending.at(-1)?.frame ?? 0;
    const frame = Math.max(this.#frameAfter(time), this.#myEngine().state.frame + 1, last);
    this.#pending.push({ frame, type });
  }

  /** A key event, for the input engine at the first frame that starts after it. */
  key(event: KeyEvent): void {
    if (!this.#playing()) return;
    const last = this.#keys.at(-1)?.frame ?? Number.NEGATIVE_INFINITY;
    const frame = Math.max(this.#frameAfter(event.time), this.#frame + 1, last);
    this.#keys.push({ event, frame });
  }

  /** `batchAck`: the batches up to `seq` are verified, so they needn't be kept. */
  acknowledge(seq: number): void {
    this.#unacknowledged = this.#unacknowledged.filter((batch) => batch.seq > seq);
  }

  /** `relay`: an opponent's verified frames, played on their engine (design §8.6). */
  relay({ playerId, frames }: ServerMessageOf<'relay'>): void {
    const game = this.#games.find((other) => other.playerId === playerId);
    const last = frames.at(-1)?.frame;
    if (!game || game === this.#me || last === undefined) return;
    // Someone watching has no loop of their own: the first relay says play has started.
    if (this.#phase === 'countdown') this.#phase = 'playing';
    game.engine.step(
      last,
      frames.flatMap((entry) => entry.actions),
    );
    this.#options.changed();
  }

  /**
   * `garbageQueued`: an attack aimed at you is received at your next frame (design §8.5, step 3).
   * Attacks between other players are only for drawing.
   */
  receiveGarbage({ to, id, lines, holeSeed }: ServerMessageOf<'garbageQueued'>): void {
    if (to !== this.#me?.playerId || this.#over()) return;
    this.#incoming.push({ frame: 0, type: ActionType.GarbageReceived, id, lines, holeSeed });
  }

  /** `playerOut`. */
  playerOut({ playerId, reason, frame }: ServerMessageOf<'playerOut'>): void {
    const game = this.#games.find((other) => other.playerId === playerId);
    if (!game) return;
    game.out = { reason, frame };
    this.#options.changed();
  }

  /** `matchEnd`: the loop stops where it is. */
  end(result: ServerMessageOf<'matchEnd'>): void {
    this.#result = result;
    this.#phase = 'ended';
    this.stop();
    this.#options.changed();
  }

  /** Stops the loop, as the match ends or the player leaves. */
  stop(): void {
    this.#cancelWake();
    this.#cancelWake = () => {};
  }

  snapshot(): OnlineMatchState {
    const { countdown } = this.#options;
    return {
      matchId: countdown.matchId,
      seed: countdown.seed,
      mode: this.#options.mode,
      phase: this.#phase,
      countdown: this.#phase === 'countdown' ? -this.#frame : 0,
      goFrame: 0,
      playerId: this.#me?.playerId ?? null,
      players: this.#games.map(({ playerId, index, engine, out }) => ({
        playerId,
        index,
        engine: engine.state,
        out,
      })),
      actions: this.#log,
      result: this.#result,
    };
  }

  #wake = (): void => {
    const before = this.#frame;
    const now = frameAt(this.#options.clock.now() - this.#options.start);
    while (this.#frame < now && !this.#over()) this.#playFrame(this.#frame + 1);
    if (this.#unsent.length >= BATCH_FRAMES || (this.#over() && this.#unsent.length > 0)) {
      this.#sendBatch();
    }
    if (!this.#over()) this.#cancelWake = this.#options.clock.schedule(this.#wake);
    if (this.#frame > before) this.#publish();
  };

  /**
   * Plays one frame: the input engine's, and from frame 1 your engine's, with the attacks received
   * and the actions the input engine makes in it, accepting garbage as a client does (design §8.5).
   */
  #playFrame(frame: number): void {
    this.#frame = frame;
    if (frame > 0) this.#phase = 'playing';
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
    const received = this.#incoming.map((action) => ({ ...action, frame }));
    this.#incoming = [];
    const { events, accepted } = engine.step(frame, [...received, ...moves], {
      acceptGarbage: true,
    });
    const actions: Action[] = [...received, ...moves, ...accepted];
    this.#unsent.push({ frame, actions });
    this.#log.push(...actions);
    this.#unheardActions.push(...moves);
    this.#unheardEvents.push(...events);
  }

  #sendBatch(): void {
    const batch: ClientMessageOf<'inputBatch'> = {
      type: 'inputBatch',
      seq: this.#nextSeq++,
      frames: this.#unsent,
    };
    this.#unsent = [];
    this.#unacknowledged.push(batch);
    this.#options.send(batch);
  }

  #publish(): void {
    this.#options.changed();
    if (this.#unheardEvents.length === 0 && this.#unheardActions.length === 0) return;
    const events = this.#unheardEvents;
    const actions = this.#unheardActions;
    this.#unheardEvents = [];
    this.#unheardActions = [];
    this.#options.heard(events, actions);
  }

  /** The first frame that starts after `time`. */
  #frameAfter(time: number): number {
    return frameAt(time - this.#options.start) + 1;
  }

  #playing(): boolean {
    return this.#me !== undefined && this.#phase !== 'ended' && !this.#over();
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
