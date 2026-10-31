import {
  ActionType,
  createEngine,
  ENGINE_VERSION,
  MARATHON,
  type PieceAction,
} from '@shura/engine';
import { describe, expect, test } from 'vitest';
import {
  createRecordsStore,
  type GameRun,
  RECORDS_VERSION,
  replayPersonalBest,
} from '../src/index';
import { memoryStorage } from './support/memory-storage';
import {
  MARATHON_ACTIONS,
  MARATHON_SEED,
  playRecorded,
  SPRINT_ACTIONS,
  SPRINT_SEED,
  ULTRA_ACTIONS,
  ULTRA_SEED,
} from './support/recorded-games';

const DATE = new Date('2026-10-31T12:00:00.000Z');

function load(stored?: unknown) {
  const storage = memoryStorage(stored === undefined ? {} : { records: stored });
  return { storage, records: createRecordsStore({ storage, now: () => DATE }) };
}

const ACTIONS: readonly PieceAction[] = [{ frame: 1, type: ActionType.HardDrop }];

type EngineChange = Partial<
  Pick<
    GameRun['engine'],
    'frame' | 'score' | 'linesCleared' | 'piecesPlaced' | 'level' | 'toppedOut' | 'finished'
  >
>;

/** A game that has ended: by default finished, after a minute, with 1,000 points. */
function run(mode: GameRun['mode'], change: EngineChange = {}): GameRun {
  return {
    mode,
    seed: 7,
    actions: ACTIONS,
    engine: {
      ...createEngine(MARATHON, 7, 0).state,
      frame: 3_600,
      score: 1_000,
      linesCleared: 40,
      piecesPlaced: 100,
      level: 1,
      toppedOut: false,
      finished: true,
      ...change,
    },
  };
}

const toppedOut = { toppedOut: true, finished: false };

describe('a Sprint personal best', () => {
  test('is the first finished game', () => {
    const { records } = load();
    expect(records.submit(run('sprint')).kind).toBe('new');
    expect(records.getState().sprint?.stats.frames).toBe(3_600);
  });

  test('is beaten by a faster finish', () => {
    const { records } = load();
    records.submit(run('sprint'));
    const outcome = records.submit(run('sprint', { frame: 3_000 }));
    expect(outcome).toMatchObject({ kind: 'new', previous: { stats: { frames: 3_600 } } });
    expect(records.getState().sprint?.stats.frames).toBe(3_000);
  });

  test.each([
    ['slower', 4_000],
    ['as fast', 3_600],
  ])('is not beaten by a %s finish', (_, frame) => {
    const { records } = load();
    records.submit(run('sprint'));
    const outcome = records.submit(run('sprint', { frame }));
    expect(outcome).toMatchObject({ kind: 'behind', best: { stats: { frames: 3_600 } } });
    expect(records.getState().sprint?.stats.frames).toBe(3_600);
  });

  test('never counts a top-out, however fast', () => {
    const { records } = load();
    expect(records.submit(run('sprint', { ...toppedOut, frame: 100 }))).toMatchObject({
      kind: 'notCounted',
      best: null,
    });
    expect(records.getState().sprint).toBeUndefined();
  });
});

describe('an Ultra personal best', () => {
  test('is beaten by a higher score over the full 2 minutes', () => {
    const { records } = load();
    expect(records.submit(run('ultra')).kind).toBe('new');
    expect(records.submit(run('ultra', { score: 900 })).kind).toBe('behind');
    expect(records.submit(run('ultra', { score: 1_000 })).kind).toBe('behind');
    expect(records.submit(run('ultra', { score: 1_100 })).kind).toBe('new');
    expect(records.getState().ultra?.stats.score).toBe(1_100);
  });

  test('never counts a top-out, however high it scored', () => {
    const { records } = load();
    records.submit(run('ultra'));
    const outcome = records.submit(run('ultra', { ...toppedOut, score: 50_000 }));
    expect(outcome).toMatchObject({ kind: 'notCounted', best: { stats: { score: 1_000 } } });
    expect(records.getState().ultra?.stats.score).toBe(1_000);
  });
});

describe('a Marathon personal best', () => {
  test('is the highest score, whether the game topped out or finished 150 lines', () => {
    const { records } = load();
    expect(records.submit(run('marathon', { ...toppedOut, score: 500 })).kind).toBe('new');
    expect(records.submit(run('marathon', { score: 400 })).kind).toBe('behind');
    expect(records.submit(run('marathon', { score: 800 })).kind).toBe('new');
    expect(records.submit(run('marathon', { ...toppedOut, score: 900 })).kind).toBe('new');
    expect(records.getState().marathon?.stats.score).toBe(900);
  });
});

describe('a game that has not ended', () => {
  test.each(['sprint', 'ultra', 'marathon'] as const)('writes no %s record', (mode) => {
    const { storage, records } = load();
    const outcome = records.submit(run(mode, { finished: false }));
    expect(outcome.kind).toBe('notCounted');
    expect(storage.texts.has('records')).toBe(false);
  });
});

describe('a personal best', () => {
  test('keeps the date, the stats, the engine version, the seed and the action log', () => {
    const { records } = load();
    records.submit(run('marathon', { level: 4, linesCleared: 33 }));
    expect(records.getState().marathon).toEqual({
      date: '2026-10-31T12:00:00.000Z',
      engineVersion: ENGINE_VERSION,
      seed: 7,
      stats: { outcome: 'finished', score: 1_000, lines: 33, pieces: 100, level: 4, frames: 3_600 },
      actions: ACTIONS,
    });
  });

  test.each([
    ['sprint', SPRINT_SEED, SPRINT_ACTIONS],
    ['marathon', MARATHON_SEED, MARATHON_ACTIONS],
    ['ultra', ULTRA_SEED, ULTRA_ACTIONS],
  ] as const)('of %s replays to the game it records', (mode, seed, actions) => {
    const { session } = playRecorded(mode, seed, actions);
    const state = session.getState();
    expect(state.phase).toBe('ended');

    const { records } = load();
    expect(records.submit(state).kind).toBe('new');
    const best = records.getState()[mode];
    if (!best) throw new Error('no personal best');
    const replayed = replayPersonalBest(mode, best);
    expect(replayed).toEqual(state.engine);
  });
});

describe('saving records', () => {
  test('writes a new personal best where the next load finds it', () => {
    const { storage, records } = load();
    records.submit(run('sprint'));
    const again = createRecordsStore({ storage });
    expect(again.problem).toBeNull();
    expect(again.getState()).toEqual(records.getState());
    expect(again.getState().version).toBe(RECORDS_VERSION);
  });

  test('writes nothing for a run that is not a personal best', () => {
    const { storage, records } = load();
    records.submit(run('sprint'));
    const saved = storage.texts.get('records');
    records.submit(run('sprint', { frame: 5_000 }));
    expect(storage.texts.get('records')).toBe(saved);
  });

  test('that fails keeps the personal best for this run, and says why', () => {
    const { storage, records } = load();
    storage.failWrites = true;
    const outcome = records.submit(run('sprint'));
    expect(outcome).toMatchObject({ kind: 'new' });
    expect(outcome.kind === 'new' && outcome.saveProblem).toMatch(/records\.json.*disk full/);
    expect(records.getState().sprint).toBeDefined();
  });
});

describe('loading records', () => {
  test('with nothing saved yet starts empty, without a message', () => {
    const { records } = load();
    expect(records.problem).toBeNull();
    expect(records.getState()).toEqual({ version: RECORDS_VERSION });
  });

  test.each([
    ['text that is not JSON', '{"version":'],
    ['a record without its action log', { version: RECORDS_VERSION, sprint: { seed: 7 } }],
    ['a version from a newer Shura', { version: RECORDS_VERSION + 1 }],
  ])('with %s sets the file aside and starts afresh, with a message', (_, stored) => {
    const { storage, records } = load(stored);
    expect(records.getState()).toEqual({ version: RECORDS_VERSION });
    expect(storage.asides.get('records')).toBe(
      typeof stored === 'string' ? stored : JSON.stringify(stored),
    );
    expect(records.problem).toContain('records.json');
    expect(records.problem).toContain('records.bak');
  });
});
