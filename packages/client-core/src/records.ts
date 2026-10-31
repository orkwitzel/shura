import {
  ActionType,
  createEngine,
  ENGINE_VERSION,
  MARATHON,
  type ModeSettings,
  type PieceAction,
  type PieceActionType,
  type ReadonlyEngineState,
  SPRINT,
  ULTRA,
} from '@shura/engine';
import { z } from 'zod';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { type SoloResult, soloResult } from './solo-result';
import type { SoloMode, SoloSessionState } from './solo-session';
import type { Storage } from './storage';
import type { Store } from './store';
import { type Migration, parseVersioned, type VersionedFormat } from './versioned';

/** The records format's version. Raise it, with a migration, when the format changes. */
export const RECORDS_VERSION = 1;

const PRESETS: Readonly<Record<SoloMode, ModeSettings>> = {
  sprint: SPRINT,
  marathon: MARATHON,
  ultra: ULTRA,
};

/**
 * A run's stats, as its results show them (`soloResult`): Finished or Game over, the score,
 * lines, pieces and level, and the frame it ended on (Sprint's time).
 */
export type RunStats = Pick<
  SoloResult,
  'outcome' | 'score' | 'lines' | 'pieces' | 'level' | 'frames'
>;

/**
 * A mode's best run (design §13.1, Personal bests): when it was played, its stats, and everything
 * needed to replay it (the engine version, the seed and the action log).
 */
export interface PersonalBest {
  /** When the run ended, as an ISO 8601 date. */
  readonly date: string;
  readonly engineVersion: number;
  readonly seed: number;
  readonly stats: RunStats;
  readonly actions: readonly PieceAction[];
}

/** Every mode's personal best, as stored. A mode without one has none yet. */
export interface Records {
  readonly version: typeof RECORDS_VERSION;
  readonly sprint?: PersonalBest;
  readonly marathon?: PersonalBest;
  readonly ultra?: PersonalBest;
}

/** A single-player game that has ended, as its session's state has it: what `submit` records. */
export type GameRun = Pick<SoloSessionState, 'mode' | 'seed' | 'actions' | 'engine'>;

/**
 * What a run did against its mode's personal best: set a new one (beating `previous`, if there was
 * one), counted but fell short of `best`, or didn't count (a Sprint or Ultra top-out, or a game
 * that hasn't ended), beside `best` if there is one.
 */
export type PersonalBestOutcome =
  | {
      readonly kind: 'new';
      readonly run: RunStats;
      readonly previous: PersonalBest | null;
      /** Why the new personal best couldn't be saved, or `null`. It's kept for this run anyway. */
      readonly saveProblem: string | null;
    }
  | { readonly kind: 'behind'; readonly run: RunStats; readonly best: PersonalBest }
  | { readonly kind: 'notCounted'; readonly run: RunStats; readonly best: PersonalBest | null };

/**
 * Which runs count towards a mode's personal best (design §13.1): Sprint's and Ultra's only when
 * finished, so a top-out never counts; Marathon's however it ended.
 */
const COUNTS: Readonly<Record<SoloMode, (result: SoloResult) => boolean>> = {
  sprint: (result) => result.outcome === 'finished',
  ultra: (result) => result.outcome === 'finished',
  marathon: () => true,
};

/** Whether a headline beats another: a faster time, or a higher score. */
function beats(run: SoloResult, best: RunStats): boolean {
  return run.headline.kind === 'time' ? run.frames < best.frames : run.score > best.score;
}

const PIECE_ACTIONS = Object.values(ActionType).filter(
  (type): type is PieceActionType => type !== ActionType.GarbageAccepted,
);

const count = z.int().min(0);
const personalBestSchema = z.object({
  date: z.iso.datetime(),
  engineVersion: z.int().min(1),
  seed: z
    .int()
    .min(0)
    .max(2 ** 32 - 1),
  stats: z.object({
    outcome: z.enum(['finished', 'gameOver']),
    score: count,
    lines: count,
    pieces: count,
    level: z.int().min(1),
    frames: count,
  }),
  actions: z.array(z.object({ frame: z.int().min(1), type: z.enum(PIECE_ACTIONS) })),
});

const RECORDS_FORMAT: VersionedFormat<Records> = {
  version: RECORDS_VERSION,
  schema: z.object({
    version: z.literal(RECORDS_VERSION),
    sprint: personalBestSchema.optional(),
    marathon: personalBestSchema.optional(),
    ultra: personalBestSchema.optional(),
  }),
  migrations: {} satisfies Record<number, Migration>,
};

const EMPTY: Records = { version: RECORDS_VERSION };

export interface RecordsStoreOptions {
  readonly storage: Storage;
  /** The time a run ends at, for its date. Without it, the system clock. */
  readonly now?: () => Date;
}

/** The personal bests, loaded from storage when created, and recorded as games end. */
export interface RecordsStore extends Store<Records> {
  /**
   * Why the stored records couldn't be used, so they were set aside and a fresh start made: a
   * message to show, or `null`.
   */
  readonly problem: string | null;
  /**
   * Records a game that has ended: a new personal best for its mode is kept and saved. Call it once
   * per game, when it ends; a game that hasn't ended writes nothing.
   */
  submit(run: GameRun): PersonalBestOutcome;
}

/** The records from `storage`, or a fresh start if they can't be used (setting them aside). */
export function createRecordsStore(options: RecordsStoreOptions): RecordsStore {
  return new RecordsStoreImpl(options);
}

class RecordsStoreImpl implements RecordsStore {
  readonly problem: string | null = null;
  readonly #storage: Storage;
  readonly #now: () => Date;
  readonly #store: StoreApi<Records>;
  /** False when the stored records couldn't be read or set aside: writing would lose them. */
  #writable = true;

  constructor({ storage, now = () => new Date() }: RecordsStoreOptions) {
    this.#storage = storage;
    this.#now = now;
    let records = EMPTY;
    try {
      const text = storage.read('records');
      if (text !== null) {
        const parsed = parseVersioned(text, RECORDS_FORMAT);
        if ('value' in parsed) records = parsed.value;
        else this.problem = this.#setAside(parsed.problem);
      }
    } catch (error) {
      this.#writable = false;
      this.problem = `Couldn't read ${storage.describe('records')}: ${(error as Error).message}. Personal bests won't be kept this time.`;
    }
    this.#store = createStore<Records>()(() => records);
  }

  getState: RecordsStore['getState'] = () => this.#store.getState();
  getInitialState: RecordsStore['getInitialState'] = () => this.#store.getInitialState();
  subscribe: RecordsStore['subscribe'] = (listener) => this.#store.subscribe(listener);

  submit = (game: GameRun): PersonalBestOutcome => {
    const result = soloResult(game);
    const { outcome, score, lines, pieces, level, frames } = result;
    const run: RunStats = { outcome, score, lines, pieces, level, frames };
    const best = this.getState()[game.mode] ?? null;
    const ended = game.engine.toppedOut || game.engine.finished;
    if (!ended || !COUNTS[game.mode](result)) return { kind: 'notCounted', run, best };
    if (best && !beats(result, best.stats)) return { kind: 'behind', run, best };
    const record: PersonalBest = {
      date: this.#now().toISOString(),
      engineVersion: ENGINE_VERSION,
      seed: game.seed,
      stats: run,
      actions: game.actions.map(({ frame, type }) => ({ frame, type })),
    };
    const records = { ...this.getState(), [game.mode]: record };
    this.#store.setState(records, true);
    let saveProblem: string | null = null;
    if (!this.#writable) saveProblem = this.problem;
    else
      try {
        this.#storage.write('records', `${JSON.stringify(records)}\n`);
      } catch (error) {
        saveProblem = `Couldn't save ${this.#storage.describe('records')}: ${(error as Error).message}`;
      }
    return { kind: 'new', run, previous: best, saveProblem };
  };

  #setAside(why: string): string {
    const name = this.#storage.describe('records');
    try {
      const aside = this.#storage.setAside('records');
      return `${name} can't be used (${why}), so it was moved to ${aside} and a fresh one started.`;
    } catch (error) {
      this.#writable = false;
      return `${name} can't be used (${why}) or moved aside (${(error as Error).message}). Personal bests won't be kept this time.`;
    }
  }
}

/**
 * Replays a personal best on the engine, to the frame it ended on: the game it records, if the
 * engine version is the same (design §13.1; verification is §16).
 */
export function replayPersonalBest(mode: SoloMode, best: PersonalBest): ReadonlyEngineState {
  const engine = createEngine(PRESETS[mode], best.seed, 0);
  engine.step(best.stats.frames, best.actions);
  return engine.state;
}
