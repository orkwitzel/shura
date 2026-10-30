import { describe, expect, test } from 'vitest';
import {
  type Action,
  ActionType,
  type ActivePiece,
  createEngine,
  FFA,
  MARATHON,
  type ModeSettings,
  ONE_VS_ONE,
  restoreEngine,
  SPRINT,
  SUBROWS_PER_ROW,
  ULTRA,
} from '../src/index';
import { withActive, withBoard } from './support/board';

/**
 * The guideline gravity curve, in seconds per row: (0.8 − (level − 1) × 0.007) ^ (level − 1). It
 * comes from Tetris Worlds (2001), and the Tetris Guideline keeps it. Sources: Hard Drop wiki,
 * "Tetris Worlds", Gravity section (https://harddrop.com/wiki/Tetris_Worlds), which tabulates it in
 * G (rows per frame) for levels 1 to 15, and TetrisWiki, "Marathon" (https://tetris.wiki/Marathon,
 * revision 25538), which gives the same formula and table for guideline Marathon, a fixed goal of
 * 10 lines per level, and a level cap of 15 in most games.
 */
function guidelineSecondsPerRow(level: number): number {
  return (0.8 - (level - 1) * 0.007) ** (level - 1);
}

/** The cited table: guideline gravity in G for levels 1 to 15, as both sources print it. */
const CITED_G = [
  0.01667, 0.021017, 0.026977, 0.035256, 0.04693, 0.06361, 0.0879, 0.1236, 0.1775, 0.2598, 0.388,
  0.59, 0.92, 1.46, 2.36,
];

/** Sub-rows per frame for `secondsPerRow`: a row is `SUBROWS_PER_ROW` sub-rows, a second 60 frames. */
function subrowsPerFrame(secondsPerRow: number): number {
  return SUBROWS_PER_ROW / (60 * secondsPerRow);
}

const SEED = 11;

/** `count` rows full but for column 10, the well. */
function well(count: number): string[] {
  return Array.from({ length: count }, () => 'LLLLLLLLL.');
}

/** An I standing in the well on the floor, so a hard drop locks it where it is. */
const I_IN_WELL: ActivePiece = { kind: 'I', col: 7, row: 3, rotation: 1 };

interface Setup {
  /** The bottom of the board, as `withBoard` takes it. */
  board?: readonly string[];
  /** The piece in play. */
  piece?: ActivePiece;
  linesCleared?: number;
  level?: number;
}

/** A fresh game of `settings`, changed by `setup`. */
function gameOf(settings: Readonly<ModeSettings>, { board = [], piece, ...stats }: Setup = {}) {
  const boarded = withBoard(createEngine(settings, SEED, 0).serialize(), board);
  return restoreEngine({ ...(piece ? withActive(boarded, piece) : boarded), ...stats });
}

/** A game of `settings` at `linesCleared` lines, with an I set to clear `lines` lines at frame 1. */
function clearingAt(settings: Readonly<ModeSettings>, linesCleared: number, lines: number) {
  const level = Math.min(1 + Math.floor(linesCleared / 10), settings.gravity.length);
  return gameOf(settings, {
    board: ['L.........', ...well(lines)],
    piece: I_IN_WELL,
    linesCleared,
    level,
  });
}

const HARD_DROP_AT_1: Action[] = [{ frame: 1, type: ActionType.HardDrop }];

describe('Marathon', () => {
  describe('gravity', () => {
    const levels = CITED_G.map((g, index) => ({ level: index + 1, g }));

    test('has a level for each of the 15 levels of the cited curve', () => {
      expect(MARATHON.gravity).toHaveLength(15);
    });

    test.each(levels)(
      'at level $level is the guideline curve to the nearest sub-row',
      ({ level }) => {
        const exact = subrowsPerFrame(guidelineSecondsPerRow(level));
        const gravity = MARATHON.gravity[level - 1] ?? Number.NaN;
        expect(Number.isInteger(gravity)).toBe(true);
        expect(Math.abs(gravity - exact)).toBeLessThanOrEqual(0.5);
      },
    );

    // The sources round to 2–5 significant figures, so this allows 0.5% either way.
    test.each(levels)('at level $level is $g G, as the sources print it', ({ level, g }) => {
      const gravity = MARATHON.gravity[level - 1] ?? Number.NaN;
      expect(Math.abs(gravity / SUBROWS_PER_ROW / g - 1)).toBeLessThan(0.005);
    });
  });

  describe('levels', () => {
    test.each([
      { from: 9, lines: 1, level: 2 },
      { from: 8, lines: 1, level: 1 },
      { from: 8, lines: 4, level: 2 },
      { from: 19, lines: 2, level: 3 },
      { from: 138, lines: 3, level: 15 },
    ])('$from lines + $lines → level $level', ({ from, lines, level }) => {
      const engine = clearingAt(MARATHON, from, lines);
      engine.step(1, HARD_DROP_AT_1);
      expect(engine.state.linesCleared).toBe(from + lines);
      expect(engine.state.level).toBe(level);
    });

    test('a clear that raises the level scores at the level it was made at', () => {
      const engine = clearingAt(MARATHON, 9, 1);
      engine.step(1, HARD_DROP_AT_1);
      expect(engine.state.score).toBe(100);
    });

    // Level 2 is 82,643 sub-rows a frame, so the 48th frame takes a piece past its first row.
    test('the next piece falls at the new level', () => {
      const engine = clearingAt(MARATHON, 9, 1);
      engine.step(1, HARD_DROP_AT_1);
      const spawnRow = engine.state.active.row;
      engine.step(47, []);
      expect(engine.state.active.row).toBe(spawnRow);
      engine.step(48, []);
      expect(engine.state.active.row).toBe(spawnRow - 1);
    });

    // Level 15 is 9,284,539 sub-rows a frame, 2.36 rows: 2, 4 and then 7 rows after 1 to 3 frames.
    test('at level 15 a piece falls 2.36 rows a frame', () => {
      const engine = gameOf(MARATHON, { level: 15, linesCleared: 140 });
      const spawnRow = engine.state.active.row;
      const fallen = [1, 2, 3].map((frame) => {
        engine.step(frame, []);
        return spawnRow - engine.state.active.row;
      });
      expect(fallen).toEqual([2, 4, 7]);
    });
  });

  describe('end', () => {
    test("ends on the lock that clears level 15's last line, at 150 lines", () => {
      const engine = clearingAt(MARATHON, 149, 1);
      engine.step(1, HARD_DROP_AT_1);
      const { finished, toppedOut, frame, level, linesCleared } = engine.state;
      expect({ finished, toppedOut, frame, level, linesCleared }).toEqual({
        finished: true,
        toppedOut: false,
        frame: 1,
        level: 15,
        linesCleared: 150,
      });
    });

    test('does not end before 150 lines', () => {
      const engine = clearingAt(MARATHON, 148, 1);
      engine.step(1, HARD_DROP_AT_1);
      expect(engine.state.finished).toBe(false);
    });

    test('ends at a top-out', () => {
      // A stack up to row 22 but for column 1, with an I standing in it: the piece that comes in
      // when the I is held can't spawn.
      const engine = gameOf(MARATHON, {
        board: Array.from({ length: 22 }, () => '.LLLLLLLLL'),
        piece: { kind: 'I', col: -2, row: 21, rotation: 1 },
      });
      engine.step(2, [{ frame: 1, type: ActionType.Hold }]);
      const { finished, toppedOut, frame } = engine.state;
      expect({ finished, toppedOut, frame }).toEqual({
        finished: false,
        toppedOut: true,
        frame: 1,
      });
    });
  });
});

describe('Sprint', () => {
  test('falls at 1 row/s', () => {
    const engine = gameOf(SPRINT);
    const spawnRow = engine.state.active.row;
    engine.step(59, []);
    expect(engine.state.active.row).toBe(spawnRow);
    engine.step(60, []);
    expect(engine.state.active.row).toBe(spawnRow - 1);
  });

  test('stays at level 1', () => {
    const engine = clearingAt(SPRINT, 9, 4);
    engine.step(1, HARD_DROP_AT_1);
    expect(engine.state.level).toBe(1);
  });

  test.each([
    { from: 39, lines: 1 },
    { from: 38, lines: 4 },
  ])(
    'ends on the lock that reaches 40 lines ($from + $lines) and keeps its frame',
    ({ from, lines }) => {
      const engine = clearingAt(SPRINT, from, lines);
      engine.step(90, [
        { frame: 25, type: ActionType.HardDrop },
        { frame: 25, type: ActionType.Hold },
        { frame: 60, type: ActionType.MoveLeft },
      ]);
      const { finished, toppedOut, frame, linesCleared, hold } = engine.state;
      expect({ finished, toppedOut, frame, linesCleared, hold }).toEqual({
        finished: true,
        toppedOut: false,
        frame: 25,
        linesCleared: from + lines,
        hold: null,
      });
    },
  );

  test('leaves the piece that finished as the active piece', () => {
    const engine = clearingAt(SPRINT, 39, 1);
    engine.step(1, HARD_DROP_AT_1);
    expect(engine.state.active).toEqual(I_IN_WELL);
  });

  test('does not end before 40 lines', () => {
    const engine = clearingAt(SPRINT, 38, 1);
    engine.step(1, HARD_DROP_AT_1);
    expect(engine.state.finished).toBe(false);
  });
});

describe('Ultra', () => {
  test('falls at 1 row/s and stays at level 1', () => {
    const engine = clearingAt(ULTRA, 9, 4);
    engine.step(1, HARD_DROP_AT_1);
    expect(engine.state.level).toBe(1);
    const spawnRow = engine.state.active.row;
    engine.step(59, []);
    expect(engine.state.active.row).toBe(spawnRow);
    engine.step(60, []);
    expect(engine.state.active.row).toBe(spawnRow - 1);
  });

  test('is still going at frame 7,199', () => {
    const engine = gameOf(ULTRA);
    engine.step(7_199, []);
    expect(engine.state.finished).toBe(false);
  });

  test("ends at frame 7,200, after that frame's actions", () => {
    const engine = gameOf(ULTRA);
    engine.step(7_199, []);
    const { piecesPlaced } = engine.state;
    engine.step(7_300, [
      { frame: 7_200, type: ActionType.HardDrop },
      { frame: 7_201, type: ActionType.HardDrop },
    ]);
    const { finished, toppedOut, frame } = engine.state;
    expect({ finished, toppedOut, frame }).toEqual({
      finished: true,
      toppedOut: false,
      frame: 7_200,
    });
    expect(engine.state.piecesPlaced).toBe(piecesPlaced + 1);
  });

  test('keeps the final score once it has ended', () => {
    // The Tetris at frame 7,101 scores 800, and the game ends 99 frames later.
    const engine = restoreEngine({ ...clearingAt(ULTRA, 0, 4).serialize(), frame: 7_100 });
    engine.step(7_200, [{ frame: 7_101, type: ActionType.HardDrop }]);
    expect(engine.state).toMatchObject({ finished: true, toppedOut: false, score: 800 });
    const ended = engine.hash();
    engine.step(8_000, [{ frame: 7_500, type: ActionType.HardDrop }]);
    expect(engine.state.score).toBe(800);
    expect(engine.hash()).toBe(ended);
  });
});

describe.each([
  { name: '1v1', settings: ONE_VS_ONE },
  { name: 'FFA', settings: FFA },
])('$name', ({ settings }) => {
  /** A game of `settings` at `frame`, with a piece just spawned. */
  function atFrame(frame: number) {
    return restoreEngine({ ...gameOf(settings).serialize(), frame });
  }

  // The proposed versus curve (design §3): 1 row/s at first, 1 row/s faster every 30 s (1,800
  // frames), and 20 rows/s from 9:30 (frame 34,200) on.
  test.each([
    { frame: 0, rowsPerSecond: 1 },
    { frame: 1_800, rowsPerSecond: 2 },
    { frame: 7_200, rowsPerSecond: 5 },
    { frame: 18_000, rowsPerSecond: 11 },
    { frame: 32_400, rowsPerSecond: 19 },
    { frame: 34_200, rowsPerSecond: 20 },
    { frame: 200_000, rowsPerSecond: 20 },
  ])('falls at $rowsPerSecond rows/s from frame $frame', ({ frame, rowsPerSecond }) => {
    const engine = atFrame(frame);
    const spawnRow = engine.state.active.row;
    // The first row takes 60 / rowsPerSecond frames, rounded up.
    const framesPerRow = Math.ceil(60 / rowsPerSecond);
    engine.step(frame + framesPerRow - 1, []);
    expect(engine.state.active.row).toBe(spawnRow);
    engine.step(frame + framesPerRow, []);
    expect(engine.state.active.row).toBe(spawnRow - 1);
  });

  test('speeds up at 30 s, frame 1,800', () => {
    // From frame 1,770: 29 frames at 1 row/s, then 2 rows/s from frame 1,800, make a row at 1,815.
    const engine = atFrame(1_770);
    const spawnRow = engine.state.active.row;
    engine.step(1_814, []);
    expect(engine.state.active.row).toBe(spawnRow);
    engine.step(1_815, []);
    expect(engine.state.active.row).toBe(spawnRow - 1);
  });

  test('stays at level 1 whatever lines are cleared', () => {
    const board = ['L.........', ...well(4)];
    const engine = gameOf(settings, { board, piece: I_IN_WELL, linesCleared: 39 });
    engine.step(1, HARD_DROP_AT_1);
    expect(engine.state.level).toBe(1);
    expect(engine.state.score).toBe(800);
  });

  test('has no line goal or frame limit: only a top-out ends it', () => {
    expect(settings.lineGoal).toBeNull();
    expect(settings.frameLimit).toBeNull();
  });

  test('lands at most 8 garbage lines a lock, with margin time from 2:00 in 30 s steps', () => {
    expect(settings.garbageCap).toBe(8);
    expect(settings.marginTimeStart).toBe(7_200);
    expect(settings.marginTimeStep).toBe(1_800);
  });
});

test('1v1 and FFA play by the same rules', () => {
  expect(FFA).toEqual(ONE_VS_ONE);
});

test.each([
  { name: 'Marathon', settings: MARATHON },
  { name: 'Sprint', settings: SPRINT },
  { name: 'Ultra', settings: ULTRA },
])('$name has no margin time', ({ settings }) => {
  expect(settings.marginTimeStart).toBeNull();
});
