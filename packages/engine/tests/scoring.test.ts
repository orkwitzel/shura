import { describe, expect, test } from 'vitest';
import {
  ActionType,
  type ActivePiece,
  createEngine,
  DEFAULT_MODE_SETTINGS,
  type Engine,
  type EngineState,
  LOCK_DELAY,
  restoreEngine,
} from '../src/index';
import { bottomRow } from '../src/pieces';
import { withBoard } from './support/board';

// The points are the guideline's, as tetris.wiki tabulates them for recent guideline games,
// including the perfect clear bonuses of Tetris Effect: https://tetris.wiki/Scoring (revision
// 26268). Combo counting follows https://tetris.wiki/Combo.

const SEED = 9;

function newEngine() {
  return createEngine(DEFAULT_MODE_SETTINGS, SEED, 0);
}

/** One lock: `piece` put in play where it rests, on `board` if given, else on the board as it is. */
interface Lock {
  board?: readonly string[];
  piece: ActivePiece;
}

/**
 * Plays each lock in turn, letting the piece's lock delay run out so it scores no drop points, and
 * returns the points each lock scored. `setup` changes the state of the fresh game first.
 */
function play(locks: readonly Lock[], setup: (state: EngineState) => void = () => {}) {
  const start = newEngine().serialize();
  setup(start);
  let engine: Engine = restoreEngine(start);
  const points: number[] = [];
  for (const { board, piece } of locks) {
    const state = board ? withBoard(engine.serialize(), board) : engine.serialize();
    state.active = piece;
    state.lowestRow = bottomRow(piece);
    const before = state.score;
    engine = restoreEngine(state);
    engine.step(state.frame + LOCK_DELAY, []);
    expect(engine.state.piecesPlaced, 'the piece should have locked').toBe(state.piecesPlaced + 1);
    points.push(engine.state.score - before);
  }
  return { engine, points };
}

/** `count` rows full but for column 10, the well. */
function well(count: number): string[] {
  return Array.from({ length: count }, () => 'LLLLLLLLL.');
}

/** An I standing in the well on the floor: it clears every well row up to 4. */
const I_IN_WELL: ActivePiece = { kind: 'I', col: 7, row: 3, rotation: 1 };

/** A lock that clears nothing: an O on the floor of an empty board, in the corner. */
const NO_CLEAR: Lock = { board: [], piece: { kind: 'O', col: 0, row: 1, rotation: 0 } };

/** `lines` well rows with a cell above them, so `I_IN_WELL` clears them but not the board. */
function clearing(lines: number): string[] {
  return ['L.........', ...well(lines)];
}

const SINGLE: Lock = { board: clearing(1), piece: I_IN_WELL };
const TETRIS: Lock = { board: clearing(4), piece: I_IN_WELL };

describe('a new engine', () => {
  test('starts at level 1 with no score, lines or pieces, no combo and no back-to-back', () => {
    const { level, score, linesCleared, piecesPlaced, combo, backToBack } = newEngine().state;
    expect({ level, score, linesCleared, piecesPlaced, combo, backToBack }).toEqual({
      level: 1,
      score: 0,
      linesCleared: 0,
      piecesPlaced: 0,
      combo: -1,
      backToBack: false,
    });
  });
});

describe('line clears', () => {
  test.each([
    { name: 'single', lines: 1, points: 100 },
    { name: 'double', lines: 2, points: 300 },
    { name: 'triple', lines: 3, points: 500 },
    { name: 'Tetris', lines: 4, points: 800 },
  ])('a $name scores $points at level 1', ({ lines, points }) => {
    const { engine, points: scored } = play([{ board: clearing(lines), piece: I_IN_WELL }]);
    expect(scored).toEqual([points]);
    expect(engine.state.linesCleared).toBe(lines);
  });

  test('score their points times the level', () => {
    const atLevel3 = (state: EngineState) => {
      state.level = 3;
    };
    expect(play([SINGLE], atLevel3).points).toEqual([300]);
    expect(play([TETRIS], atLevel3).points).toEqual([2400]);
  });
});

describe('back-to-back', () => {
  test('a Tetris after a Tetris scores half as much again, 1200, with a lock between that clears nothing', () => {
    const { engine, points } = play([TETRIS, NO_CLEAR, TETRIS]);
    expect(points).toEqual([800, 0, 1200]);
    expect(engine.state.backToBack).toBe(true);
  });

  test.each([
    { name: 'single', lines: 1, points: 100 },
    { name: 'double', lines: 2, points: 300 },
    { name: 'triple', lines: 3, points: 500 },
  ])('a $name between two Tetrises breaks the chain', ({ lines, points }) => {
    const clear = { board: clearing(lines), piece: I_IN_WELL };
    const { points: scored } = play([TETRIS, NO_CLEAR, clear, NO_CLEAR, TETRIS]);
    expect(scored).toEqual([800, 0, points, 0, 800]);
  });

  test('a single after a Tetris ends back-to-back status', () => {
    const { engine } = play([TETRIS, NO_CLEAR, SINGLE]);
    expect(engine.state.backToBack).toBe(false);
  });
});

describe('combos', () => {
  test('each lock in a row that clears lines scores 50 times the combo on top of its clear', () => {
    const { engine, points } = play([SINGLE, SINGLE, SINGLE]);
    expect(points).toEqual([100, 100 + 50, 100 + 100]);
    expect(engine.state.combo).toBe(2);
  });

  test('a lock that clears nothing resets the combo', () => {
    expect(play([SINGLE, SINGLE, NO_CLEAR]).engine.state.combo).toBe(-1);
    expect(play([SINGLE, SINGLE, NO_CLEAR, SINGLE]).points).toEqual([100, 150, 0, 100]);
  });

  test('the combo bonus is times the level', () => {
    const atLevel2 = (state: EngineState) => {
      state.level = 2;
    };
    expect(play([SINGLE, SINGLE, SINGLE], atLevel2).points).toEqual([200, 300, 400]);
  });

  test('the back-to-back bonus leaves the combo bonus out', () => {
    expect(play([TETRIS, TETRIS]).points).toEqual([800, 1200 + 50]);
  });
});

describe('perfect clears', () => {
  test.each([
    {
      name: 'single',
      board: ['LLLLLL....'],
      piece: { kind: 'I', col: 6, row: 1, rotation: 0 },
      points: 100 + 800,
    },
    {
      name: 'double',
      board: ['LLLLLLLL..', 'LLLLLLLL..'],
      piece: { kind: 'O', col: 8, row: 1, rotation: 0 },
      points: 300 + 1200,
    },
    {
      name: 'triple',
      board: ['LLLLLLLLL.', 'LLLLLLLLL.', 'LLLLLLLL..'],
      piece: { kind: 'J', col: 8, row: 2, rotation: 3 },
      points: 500 + 1800,
    },
    { name: 'Tetris', board: well(4), piece: I_IN_WELL, points: 800 + 2000 },
  ] satisfies (Lock & { name: string; points: number })[])(
    'a $name that empties the board scores the perfect clear bonus on top: $points',
    ({ board, piece, points }) => {
      const { engine, points: scored } = play([{ board, piece }]);
      expect(scored).toEqual([points]);
      expect(engine.state.board.flat().every((cell) => cell === null)).toBe(true);
    },
  );

  test('a back-to-back Tetris perfect clear scores 3200 on top', () => {
    const tetrisPerfectClear = { board: well(4), piece: I_IN_WELL };
    expect(play([TETRIS, NO_CLEAR, tetrisPerfectClear]).points).toEqual([800, 0, 1200 + 3200]);
  });

  test('the bonus is times the level', () => {
    const atLevel2 = (state: EngineState) => {
      state.level = 2;
    };
    expect(play([{ board: well(4), piece: I_IN_WELL }], atLevel2).points).toEqual([5600]);
  });
});

describe('drops', () => {
  /** A fresh game with a T in play, its flat side 10 rows above the floor or `board`. */
  function fallingT(setup: (state: EngineState) => void = () => {}) {
    const state = newEngine().serialize();
    setup(state);
    state.active = { kind: 'T', col: 3, row: 11, rotation: 0 };
    state.lowestRow = 10;
    return restoreEngine(state);
  }

  test('soft drop scores 1 point per row', () => {
    const engine = fallingT();
    engine.step(3, [
      { frame: 1, type: ActionType.SoftDrop },
      { frame: 2, type: ActionType.SoftDrop },
      { frame: 2, type: ActionType.SoftDrop },
    ]);
    expect(engine.state.active.row).toBe(8);
    expect(engine.state.score).toBe(3);
  });

  test('soft drops that the stack stops score nothing', () => {
    const engine = fallingT();
    engine.step(
      1,
      Array.from({ length: 12 }, () => ({ frame: 1, type: ActionType.SoftDrop })),
    );
    expect(engine.state.score).toBe(10);
  });

  test('gravity scores nothing', () => {
    const engine = fallingT();
    engine.step(120, []);
    expect(engine.state.active.row).toBe(9);
    expect(engine.state.score).toBe(0);
  });

  test('hard drop scores 2 points per row', () => {
    const engine = fallingT();
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    expect(engine.state.piecesPlaced).toBe(1);
    expect(engine.state.score).toBe(20);
  });

  test('drop points add to the points of the clear and are not times the level', () => {
    const engine = fallingT((state) => {
      Object.assign(state, withBoard(state, ['ZZZ...ZZZZ']));
      state.level = 2;
    });
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    expect(engine.state.score).toBe(20 + 2 * 100);
  });
});

describe('pieces placed', () => {
  test('counts every lock, and a hold is not one', () => {
    const engine = newEngine();
    engine.step(3, [
      { frame: 1, type: ActionType.HardDrop },
      { frame: 2, type: ActionType.Hold },
      { frame: 3, type: ActionType.HardDrop },
    ]);
    expect(engine.state.piecesPlaced).toBe(2);
  });
});
