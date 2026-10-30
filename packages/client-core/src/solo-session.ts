import {
  createEngine,
  type Engine,
  type ModeSettings,
  type PieceAction,
  type PieceActionType,
  type ReadonlyEngineState,
  SPRINT,
} from '@shura/engine';
import type { Clock } from './clock';
import { type Store, StoreState } from './store';

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

export interface SoloSession extends Store<SoloSessionState> {
  /**
   * An action that arrived at `time` (on the session's clock). It applies at the first frame that
   * starts after `time`, or at the first frame not yet stepped if that is later.
   */
  act(type: PieceActionType, time: number): void;
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
  readonly #engine: Engine;
  readonly #store: StoreState<SoloSessionState>;
  /** The clock's time at the start of frame 0. */
  #start: number;
  /** The last frame the loop has reached, the countdown's included. */
  #frame = -COUNTDOWN_FRAMES;
  /** While paused, the time since frame 0 started at the pause. */
  #pausedAt: number | null = null;
  #cancelWake: () => void;
  /** Actions waiting for their frame, in frame order. */
  #pending: PieceAction[] = [];
  readonly #log: PieceAction[] = [];
  readonly #mode: SoloMode;
  readonly #seed: number;

  constructor({ mode, clock, seed = freshSeed() }: SoloSessionOptions) {
    this.#clock = clock;
    this.#mode = mode;
    this.#seed = seed;
    this.#engine = createEngine(PRESETS[mode], seed, 0);
    this.#start = clock.now() + timeOf(COUNTDOWN_FRAMES);
    this.#store = new StoreState(this.#snapshot());
    this.#cancelWake = clock.schedule(this.#wake);
  }

  getState = (): SoloSessionState => this.#store.getState();
  subscribe = (listener: () => void): (() => void) => this.#store.subscribe(listener);

  act = (type: PieceActionType, time: number): void => {
    if (this.#pausedAt !== null || this.#over()) return;
    const last = this.#pending.at(-1)?.frame ?? 0;
    const frame = Math.max(frameAt(time - this.#start) + 1, this.#engine.state.frame + 1, last);
    this.#pending.push({ frame, type });
  };

  pause = (): void => {
    if (this.#pausedAt !== null || this.#over()) return;
    this.#cancelWake();
    if (this.#catchUp() && !this.#over()) this.#pausedAt = this.#time();
    this.#store.set(this.#snapshot());
  };

  resume = (): void => {
    if (this.#pausedAt === null) return;
    // The time into the loop's frame at the pause carries over, and the countdown starts again.
    const into = this.#pausedAt - timeOf(this.#frame);
    this.#frame = this.#engine.state.frame - COUNTDOWN_FRAMES;
    this.#start = this.#clock.now() - timeOf(this.#frame) - into;
    this.#pausedAt = null;
    this.#store.set(this.#snapshot());
    this.#cancelWake = this.#clock.schedule(this.#wake);
  };

  #wake = (): void => {
    const before = this.#frame;
    const caughtUp = this.#catchUp();
    if (caughtUp && !this.#over()) this.#cancelWake = this.#clock.schedule(this.#wake);
    if (!caughtUp || this.#frame > before) this.#store.set(this.#snapshot());
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

  /** Plays one frame: during the countdown nothing, after it the engine's frame. */
  #playFrame(frame: number): void {
    this.#frame = frame;
    if (frame <= this.#engine.state.frame) return;
    let count = 0;
    while (this.#pending[count]?.frame === frame) count++;
    const actions = this.#pending.splice(0, count);
    this.#engine.step(frame, actions);
    this.#log.push(...actions);
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
