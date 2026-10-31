import { describe, expect, test } from 'vitest';
import {
  type Action,
  ActionType,
  BOARD_WIDTH,
  type BoardCell,
  createEngine,
  type EngineEvent,
  type LockEvent,
  MARATHON,
  ONE_VS_ONE,
  SPRINT,
  TSpin,
  ULTRA,
} from '../src/index';
import { clearing, type GameSetup, gameOf, HARD_DROP_AT_1, I_IN_WELL, well } from './support/game';
import { byFrame } from './support/match';
import { loadRecordedMatches, settingsOf } from './support/recorded-matches';
import { TEST_SETTINGS } from './support/settings';
import { IN_PLACE, TSD_SLOT } from './support/t-spin';

/** An O on the floor in the left corner of an empty board: a lock that clears nothing. */
const O_ON_FLOOR = { kind: 'O', col: 0, row: 1, rotation: 0 } as const;

/** The locks among `events`. */
function locksIn(events: readonly EngineEvent[]): LockEvent[] {
  return events.filter((event): event is LockEvent => event.type === 'lock');
}

/** The one lock among `events`. */
function lockIn(events: readonly EngineEvent[]): LockEvent {
  const locks = locksIn(events);
  expect(locks).toHaveLength(1);
  return locks[0] as LockEvent;
}

/** The lock event of a hard drop at frame 1 in a test game changed by `setup`. */
function hardDropLock(setup: GameSetup): LockEvent {
  return lockIn(gameOf(TEST_SETTINGS, setup).step(1, HARD_DROP_AT_1).events);
}

/** The parts of a lock event that callouts read. */
function scoring({ clear, combo, backToBack }: LockEvent) {
  return { ...clear, combo, backToBack };
}

describe('step events', () => {
  test('a hard drop that clears a single reports the drop, then the lock', () => {
    const engine = gameOf(TEST_SETTINGS, {
      board: clearing(1).board,
      piece: { kind: 'I', col: 7, row: 10, rotation: 1 },
    });
    const { events } = engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    expect(events).toEqual([
      { type: 'hardDrop', frame: 1, rows: 7 },
      {
        type: 'lock',
        frame: 1,
        clear: { lines: 1, tSpin: TSpin.None, perfectClear: false },
        combo: 0,
        backToBack: false,
        piece: {
          kind: 'I',
          cells: [
            { col: 9, row: 3 },
            { col: 9, row: 2 },
            { col: 9, row: 1 },
            { col: 9, row: 0 },
          ],
        },
        clearedRows: [{ row: 0, cells: [...'LLLLLLLLLI'] }],
      },
    ]);
  });

  test('a T-spin double reports its T-spin, its two rows and the T that locked', () => {
    const lock = hardDropLock({ ...TSD_SLOT, lastTurn: IN_PLACE });
    expect(scoring(lock)).toEqual({
      lines: 2,
      tSpin: TSpin.Full,
      perfectClear: false,
      combo: 0,
      backToBack: true,
    });
    expect(lock.clearedRows).toEqual([
      { row: 0, cells: [...'LLTLLLLLLL'] },
      { row: 1, cells: [...'LTTTLLLLLL'] },
    ]);
    expect(lock.piece.kind).toBe('T');
    expect(lock.piece.cells).toHaveLength(4);
    expect(lock.piece.cells).toEqual(
      expect.arrayContaining([
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 3, row: 1 },
        { col: 2, row: 0 },
      ]),
    );
  });

  test('a difficult clear after another reports back-to-back', () => {
    expect(scoring(hardDropLock({ ...clearing(4), backToBack: true }))).toMatchObject({
      lines: 4,
      backToBack: true,
    });
    expect(scoring(hardDropLock({ ...clearing(1), backToBack: true }))).toMatchObject({
      lines: 1,
      backToBack: false,
    });
  });

  test('a clear in a combo reports the combo counter after it', () => {
    expect(scoring(hardDropLock({ ...clearing(1), combo: 2 }))).toMatchObject({ combo: 3 });
    expect(scoring(hardDropLock({ piece: O_ON_FLOOR, combo: 2 }))).toMatchObject({
      lines: 0,
      combo: -1,
    });
  });

  test('a perfect clear reports it, with the rows it emptied', () => {
    const lock = hardDropLock({
      board: ['LLLLLLLL..', 'LLLLLLLL..'],
      piece: { kind: 'O', col: 8, row: 1, rotation: 0 },
    });
    expect(scoring(lock)).toMatchObject({ lines: 2, perfectClear: true });
    expect(lock.clearedRows).toEqual([
      { row: 0, cells: [...'LLLLLLLLOO'] },
      { row: 1, cells: [...'LLLLLLLLOO'] },
    ]);
  });

  test('a hold reports it, once per piece', () => {
    const engine = gameOf(TEST_SETTINGS);
    const { events } = engine.step(2, [
      { frame: 1, type: ActionType.Hold },
      { frame: 2, type: ActionType.Hold },
    ]);
    expect(events).toEqual([{ type: 'hold', frame: 1 }]);
  });

  test('a turn reports whether it kicked', () => {
    const engine = gameOf(TEST_SETTINGS, { piece: { kind: 'T', col: 3, row: 10, rotation: 0 } });
    expect(engine.step(1, [{ frame: 1, type: ActionType.RotateCW }]).events).toEqual([
      { type: 'turn', frame: 1, kicked: false },
    ]);
    // Pointing right against the left wall, the T turns back only by a kick to the right.
    const moves = [2, 3, 4, 5].map((frame): Action => ({ frame, type: ActionType.MoveLeft }));
    expect(engine.step(5, moves).events).toEqual([]);
    expect(engine.state.active).toMatchObject({ col: -1, rotation: 1 });
    expect(engine.step(6, [{ frame: 6, type: ActionType.RotateCCW }]).events).toEqual([
      { type: 'turn', frame: 6, kicked: true },
    ]);
  });

  test('a turn that finds no room reports that it failed', () => {
    // An I standing in an 8-row well: lying flat, it fits nowhere a kick can reach.
    const engine = gameOf(TEST_SETTINGS, { board: well(8), piece: I_IN_WELL });
    const { events } = engine.step(2, [
      { frame: 1, type: ActionType.RotateCW },
      { frame: 2, type: ActionType.RotateCCW },
    ]);
    expect(events).toEqual([
      { type: 'turnFailed', frame: 1 },
      { type: 'turnFailed', frame: 2 },
    ]);
    expect(engine.state.active).toEqual(I_IN_WELL);
  });

  describe('garbage landing (versus)', () => {
    const garbage = [
      { id: 1, lines: 3, holeSeed: 101 },
      { id: 2, lines: 4, holeSeed: 202 },
    ];
    const expected = [
      { type: 'hardDrop', frame: 1, rows: 0 },
      expect.objectContaining({ type: 'lock', frame: 1 }),
      { type: 'garbageLanded', frame: 1, lines: 7 },
    ];

    test('accepting garbage, reports the lines that landed at the lock', () => {
      const engine = gameOf(ONE_VS_ONE, { piece: O_ON_FLOOR, garbage });
      expect(engine.step(1, HARD_DROP_AT_1, { acceptGarbage: true }).events).toEqual(expected);
    });

    test('replaying garbageAccepted, reports the same', () => {
      const engine = gameOf(ONE_VS_ONE, { piece: O_ON_FLOOR, garbage });
      const { events } = engine.step(1, [
        ...HARD_DROP_AT_1,
        { frame: 1, type: ActionType.GarbageAccepted, id: 1 },
        { frame: 1, type: ActionType.GarbageAccepted, id: 2 },
      ]);
      expect(events).toEqual(expected);
    });
  });

  test('a lock that raises the level reports the new level after the lock', () => {
    const engine = gameOf(MARATHON, { ...clearing(1), linesCleared: 9 });
    expect(engine.step(1, HARD_DROP_AT_1).events).toEqual([
      { type: 'hardDrop', frame: 1, rows: 0 },
      expect.objectContaining({ type: 'lock', frame: 1 }),
      { type: 'levelUp', frame: 1, level: 2 },
    ]);
  });

  describe('a top-out', () => {
    test('by a block out comes after what caused it', () => {
      // A stack up to row 22 but for column 1: the piece that comes in when the I is held can't
      // spawn.
      const engine = gameOf(TEST_SETTINGS, {
        board: Array.from({ length: 22 }, () => '.LLLLLLLLL'),
        piece: { kind: 'I', col: -2, row: 21, rotation: 1 },
      });
      expect(engine.step(5, [{ frame: 1, type: ActionType.Hold }]).events).toEqual([
        { type: 'hold', frame: 1 },
        { type: 'topOut', frame: 1 },
      ]);
    });

    test('by a lock out reports the lock, which clears nothing, then the top-out', () => {
      const piece = { kind: 'O', col: 4, row: 21, rotation: 0 } as const;
      const engine = gameOf(TEST_SETTINGS, {
        board: Array.from({ length: 20 }, () => '.LLLLLLLLL'),
        piece,
      });
      expect(engine.step(5, HARD_DROP_AT_1).events).toEqual([
        { type: 'hardDrop', frame: 1, rows: 0 },
        {
          type: 'lock',
          frame: 1,
          clear: { lines: 0, tSpin: TSpin.None, perfectClear: false },
          combo: -1,
          backToBack: false,
          piece: {
            kind: 'O',
            cells: expect.arrayContaining([
              { col: 4, row: 21 },
              { col: 5, row: 21 },
              { col: 4, row: 20 },
              { col: 5, row: 20 },
            ]),
          },
          clearedRows: [],
        },
        { type: 'topOut', frame: 1 },
      ]);
    });
  });

  describe('a finish', () => {
    test("by Sprint's line goal comes after the lock that reached it", () => {
      const engine = gameOf(SPRINT, { ...clearing(1), linesCleared: 39 });
      const { events } = engine.step(90, [
        ...HARD_DROP_AT_1,
        { frame: 1, type: ActionType.Hold },
        { frame: 60, type: ActionType.MoveLeft },
      ]);
      expect(events).toEqual([
        { type: 'hardDrop', frame: 1, rows: 0 },
        expect.objectContaining({ type: 'lock', frame: 1 }),
        { type: 'finish', frame: 1 },
      ]);
    });

    test("by Ultra's time limit comes at its last frame", () => {
      const limit = ULTRA.frameLimit as number;
      const engine = gameOf(ULTRA, { frame: limit - 2 });
      expect(engine.step(limit + 5, []).events).toEqual([{ type: 'finish', frame: limit }]);
    });
  });

  test('a step that is already over reports nothing', () => {
    const engine = gameOf(SPRINT, { ...clearing(1), linesCleared: 39 });
    engine.step(1, HARD_DROP_AT_1);
    expect(engine.step(100, [{ frame: 2, type: ActionType.Hold }]).events).toEqual([]);
  });
});

const singlePlayerMatches = loadRecordedMatches().filter(({ match }) => match.players.length === 1);

/** A recorded single-player match's game, from its start, and its actions. */
function recordedGame(file: string) {
  const entry = singlePlayerMatches.find((candidate) => candidate.file === file);
  if (!entry) throw new Error(`no single-player recorded match ${file}`);
  const { match } = entry;
  const actions: Action[] = match.players[0]?.actions ?? [];
  return {
    engine: createEngine(settingsOf(match), match.seed, 0),
    actions,
    lastFrame: match.lastFrame,
  };
}

describe.each(singlePlayerMatches)('the events of the recorded match $file', ({ file }) => {
  test('are the same stepped in one call, frame by frame, or in uneven spans', () => {
    const whole = recordedGame(file);
    const all = whole.engine.step(whole.lastFrame, whole.actions).events;
    expect(all.some((event) => event.type === 'lock')).toBe(true);

    for (const span of [1, 7, 61]) {
      const { engine, actions, lastFrame } = recordedGame(file);
      const frames = byFrame(actions, lastFrame);
      const events: EngineEvent[] = [];
      for (let from = 1; from <= lastFrame; from += span) {
        const to = Math.min(from + span - 1, lastFrame);
        events.push(...engine.step(to, frames.slice(from, to + 1).flat()).events);
      }
      expect(events, `in spans of ${span}`).toEqual(all);
      expect(engine.hash()).toBe(whole.engine.hash());
    }
  });

  test("rebuild the board from each lock's piece and cleared rows", () => {
    const { engine, actions, lastFrame } = recordedGame(file);
    const frames = byFrame(actions, lastFrame);
    let board: BoardCell[][] = engine.serialize().board;
    for (let frame = 1; frame <= lastFrame; frame++) {
      const locks = locksIn(engine.step(frame, frames[frame] ?? []).events);
      // A single-player board changes only when a piece locks.
      if (locks.length === 0) continue;
      for (const event of locks) {
        for (const { col, row } of event.piece.cells) {
          expect(board[row]?.[col], 'a piece locks in empty cells').toBeNull();
          (board[row] as BoardCell[])[col] = event.piece.kind;
        }
        const full = board.flatMap((cells, row) =>
          cells.every((cell) => cell !== null) ? [{ row, cells }] : [],
        );
        expect(event.clearedRows).toEqual(full);
        expect(event.clear.lines).toBe(full.length);
        const kept = board.filter((cells) => cells.some((cell) => cell === null));
        const emptied = full.map(() => Array.from({ length: BOARD_WIDTH }, () => null));
        board = [...kept, ...emptied];
      }
      expect(board).toEqual(engine.state.board);
    }
  });
});
