import {
  createEngine,
  type Engine,
  type ModeSettings,
  type PieceAction,
  type PieceActionType,
  type ReadonlyEngineState,
  SPRINT,
} from '@shura/engine';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Clock } from './clock';
import {
  type AutoShift,
  createInputEngine,
  DEFAULT_HANDLING,
  type Handling,
  type InputEngine,
  type InputSettings,
  type KeyEvent,
} from './input-engine';
import type { Store } from './store';

/** The single-player modes a session can play. */
export type SoloMode = 'sprint';

const PRESETS: Readonly<Record<SoloMode, ModeSettings>> = { sprint: SPRINT };

/** The countdown before Go: frames −90 to −1 (design §13.1). */
const COUNTDOWN_FRAMES = 90;

/** The most frames a wake steps. More is a stall, and pauses the game instead (design §13.1). */
const MAX_CATCH_UP = 30;

/**
 * Where a session is: counting down to Go, playing, paused (the UI shows the in-game menu while
 * paused), or ended, by a top-out or by finishing (the engine's state says which).
 */
export type SoloPhase = 'countdown' | 'playing' | 'paused' | 'ended';

export interface SoloSessionOptions {
  mode: SoloMode;
  clock: Clock;
  /** The game's seed, a 32-bit unsigned integer. Without one, the session picks a fresh seed. */
  seed?: number;
  /** The player's handling. Without it, the defaults (design §7.2). */
  handling?: Partial<Handling>;
  /** What moves a held direction. Without it, DAS and ARR (precise input). */
  autoShift?: AutoShift;
}

export interface SoloSessionState {
  readonly mode: SoloMode;
  readonly seed: number;
  readonly phase: SoloPhase;
  /** During the countdown, the frames left before Go (90 to 1). Otherwise 0. */
  readonly countdown: number;
  /** The game, live: the engine's own state, which the next step changes. */
  readonly engine: ReadonlyEngineState;
  /** Every action the game has applied, in order: its action log, live like `engine`. */
  readonly actions: readonly PieceAction[];
}

/**
 * Something that happened during an engine step, with its frame (design §5.2, §13.1). A stand-in
 * until the engine reports events (M3), when this becomes the engine's own event type.
 */
export interface SessionEvent {
  readonly frame: number;
  readonly type: string;
}

/** Hears the events of each wake, in frame order. */
export type SessionEventListener = (events: readonly SessionEvent[]) => void;

export interface SoloSession extends Store<SoloSessionState> {
  /**
   * An action that arrived at `time` (on the session's clock). It applies at the first frame that
   * starts after `time`, or at the first frame not yet stepped if that is later.
   */
  act(type: PieceActionType, time: number): void;
  /**
   * A key event from the UI's adapter, for the input engine. It reaches the input engine at the
   * first frame that starts after its time, or at the first frame not yet played if that is later.
   */
  key(event: KeyEvent): void;
  /**
   * Changes how the input engine takes key events, from the next frame: the handling after the
   * settings screen, or the auto-shift once the CLI knows its adapter. Keys held stay held.
   */
  setInput(settings: Partial<InputSettings>): void;
  /**
   * Stops the game, after stepping the frames that have started (unless that is a stall). Actions
   * are ignored while paused.
   */
  pause(): void;
  /**
   * Carries on from the frame the game paused at, through the countdown: the start moves forward
   * by the time paused, plus the countdown.
   */
  resume(): void;
  /**
   * Starts a new game of the same mode from `seed` (without one, a fresh seed), through the
   * countdown, whatever the phase: from the menu or from the results. The action log starts empty,
   * and the input engine carries on, so a key held into the restart (or released after the game
   * ended) is held (or released) in the new game, and a held direction is charged at Go.
   */
  restart(seed?: number): void;
  /**
   * Adds a listener for engine events, which each wake passes on in frame order (design §13.1).
   * Events are moments, not state, so they don't go through the store. Returns a function that
   * removes the listener. Nothing calls listeners until the engine reports events (M3).
   */
  onEvents(listener: SessionEventListener): () => void;
}

/** The frame at `elapsed` milliseconds after frame 0 started. */
function frameAt(elapsed: number): number {
  return Math.floor((elapsed * 60) / 1000);
}

/** The time from the start of frame 0 to the start of `frame`, in milliseconds. */
function timeOf(frame: number): number {
  return (frame * 1000) / 60;
}

/** A random 32-bit unsigned seed. Only the engine needs determinism, not the choice of seed. */
function freshSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

/** A single-player game of `mode`, starting with the countdown now. */
export function createSoloSession(options: SoloSessionOptions): SoloSession {
  return new Session(options);
}

class Session implements SoloSession {
  readonly #clock: Clock;
  #engine: Engine;
  readonly #store: StoreApi<SoloSessionState>;
  /** The clock's time at the start of frame 0. */
  #start: number;
  /** The last frame the loop has reached, the countdown's included. */
  #frame = -COUNTDOWN_FRAMES;
  /** While paused, the time since frame 0 started at the pause. */
  #pausedAt: number | null = null;
  #cancelWake: () => void;
  /** Actions waiting for their frame, in frame order. */
  #pending: PieceAction[] = [];
  #log: PieceAction[] = [];
  readonly #input: InputEngine;
  /** Key events waiting for the frame the input engine takes them at, in frame order. */
  #keys: { event: KeyEvent; frame: number }[] = [];
  readonly #eventListeners = new Set<SessionEventListener>();
  readonly #mode: SoloMode;
  #seed: number;

  constructor({ mode, clock, seed = freshSeed(), handling, autoShift }: SoloSessionOptions) {
    this.#clock = clock;
    this.#input = createInputEngine({
      handling: { ...DEFAULT_HANDLING, ...handling },
      ...(autoShift && { autoShift }),
    });
    this.#mode = mode;
    this.#seed = seed;
    this.#engine = createEngine(PRESETS[mode], seed, 0);
    this.#start = clock.now() + timeOf(COUNTDOWN_FRAMES);
    this.#store = createStore<SoloSessionState>()(() => this.#snapshot());
    this.#cancelWake = clock.schedule(this.#wake);
  }

  getState: SoloSession['getState'] = () => this.#store.getState();
  getInitialState: SoloSession['getInitialState'] = () => this.#store.getInitialState();
  subscribe: SoloSession['subscribe'] = (listener) => this.#store.subscribe(listener);

  act = (type: PieceActionType, time: number): void => {
    if (this.#pausedAt !== null || this.#over()) return;
    const last = this.#pending.at(-1)?.frame ?? 0;
    const frame = Math.max(frameAt(time - this.#start) + 1, this.#engine.state.frame + 1, last);
    this.#pending.push({ frame, type });
  };

  key = (event: KeyEvent): void => {
    // Once the game has ended, keys still count, for a restart: they wait without waking anything.
    const last = this.#keys.at(-1)?.frame ?? -Infinity;
    const frame = Math.max(frameAt(event.time - this.#start) + 1, this.#frame + 1, last);
    this.#keys.push({ event, frame });
  };

  setInput = (settings: Partial<InputSettings>): void => {
    this.#input.configure(settings);
  };

  pause = (): void => {
    if (this.#pausedAt !== null || this.#over()) return;
    this.#cancelWake();
    if (this.#catchUp() && !this.#over()) this.#pausedAt = this.#time();
    this.#publish();
  };

  resume = (): void => {
    if (this.#pausedAt === null) return;
    // The time into the loop's frame at the pause carries over, and the countdown starts again.
    const into = this.#pausedAt - timeOf(this.#frame);
    this.#frame = this.#engine.state.frame - COUNTDOWN_FRAMES;
    this.#start = this.#clock.now() - timeOf(this.#frame) - into;
    this.#pausedAt = null;
    // Keys pressed or released at the pause or during it reach the input engine as the countdown
    // starts, so a direction held through it is charged at Go.
    for (const waiting of this.#keys) waiting.frame = this.#frame + 1;
    this.#publish();
    this.#cancelWake = this.#clock.schedule(this.#wake);
  };

  restart = (seed: number = freshSeed()): void => {
    this.#cancelWake();
    this.#seed = seed;
    this.#engine = createEngine(PRESETS[this.#mode], seed, 0);
    this.#pending = [];
    this.#log = [];
    this.#pausedAt = null;
    this.#frame = -COUNTDOWN_FRAMES;
    this.#start = this.#clock.now() + timeOf(COUNTDOWN_FRAMES);
    // As on resuming, waiting keys reach the input engine as the countdown starts.
    for (const waiting of this.#keys) waiting.frame = this.#frame + 1;
    this.#publish();
    this.#cancelWake = this.#clock.schedule(this.#wake);
  };

  onEvents = (listener: SessionEventListener): (() => void) => {
    // A wrapper, so adding the same function twice calls it twice and removing it removes one.
    const call: SessionEventListener = (events) => listener(events);
    this.#eventListeners.add(call);
    return () => {
      this.#eventListeners.delete(call);
    };
  };

  #wake = (): void => {
    const before = this.#frame;
    const caughtUp = this.#catchUp();
    if (caughtUp && !this.#over()) this.#cancelWake = this.#clock.schedule(this.#wake);
    if (!caughtUp || this.#frame > before) this.#publish();
  };

  /** The time since frame 0 started. */
  #time(): number {
    return this.#clock.now() - this.#start;
  }

  /** Whether the game has ended, by a top-out or by finishing. */
  #over(): boolean {
    const { toppedOut, finished } = this.#engine.state;
    return toppedOut || finished;
  }

  /**
   * Plays every frame that has started, unless there are more than 30 of them, time the player
   * never saw: then it pauses the game as if at the start of the last frame played, and returns
   * false.
   */
  #catchUp(): boolean {
    const now = frameAt(this.#time());
    if (now - this.#frame > MAX_CATCH_UP) {
      this.#pausedAt = timeOf(this.#frame);
      return false;
    }
    while (this.#frame < now && !this.#over()) this.#playFrame(this.#frame + 1);
    return true;
  }

  /**
   * Plays one frame: the input engine's, and after the countdown the engine's, with the actions the
   * input engine makes in it.
   */
  #playFrame(frame: number): void {
    this.#frame = frame;
    let keys = 0;
    while ((this.#keys[keys]?.frame ?? Infinity) <= frame) keys++;
    const events = this.#keys.splice(0, keys).map(({ event }) => event);
    const countdown = frame <= this.#engine.state.frame;
    const made = this.#input.playFrame(events, countdown ? null : this.#engine.state);
    if (countdown) return;
    let count = 0;
    while (this.#pending[count]?.frame === frame) count++;
    const actions = this.#pending.splice(0, count);
    for (const type of made) actions.push({ frame, type });
    this.#engine.step(frame, actions);
    this.#log.push(...actions);
  }

  /** Replaces the store's state with a fresh snapshot, notifying every subscriber. */
  #publish(): void {
    this.#store.setState(this.#snapshot(), true);
  }

  #snapshot(): SoloSessionState {
    const countdown = Math.max(this.#engine.state.frame - this.#frame, 0);
    let phase: SoloPhase = countdown > 0 ? 'countdown' : 'playing';
    if (this.#pausedAt !== null) phase = 'paused';
    if (this.#over()) phase = 'ended';
    return {
      mode: this.#mode,
      seed: this.#seed,
      phase,
      countdown,
      engine: this.#engine.state,
      actions: this.#log,
    };
  }
}
