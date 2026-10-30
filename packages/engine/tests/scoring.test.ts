import { describe, expect, test } from 'vitest';
import { isEmpty } from '../src/board';
import {
  ActionType,
  type ActivePiece,
  createEngine,
  DEFAULT_MODE_SETTINGS,
  type Engine,
  type EngineState,
  LOCK_DELAY,
  restoreEngine,
  type Turn,
} from '../src/index';
import { withActive, withBoard } from './support/board';

// The points are the guideline's, as tetris.wiki tabulates them for recent guideline games,
// including the perfect clear bonuses of Tetris Effect: https://tetris.wiki/Scoring (revision
// 26268), T-spins included. Combo counting follows https://tetris.wiki/Combo.

const SEED = 9;

function newEngine() {
  return createEngine(DEFAULT_MODE_SETTINGS, SEED, 0);
}

/**
 * One lock: `piece` put in play where it rests, on `board` if given, else on the board as it is,
 * and turned into place by `turn` if given.
 */
interface Lock {
  board?: readonly string[];
  piece: ActivePiece;
  turn?: Turn;
}

/** Changes the state of a fresh game. */
type Setup = (state: EngineState) => EngineState;

/**
 * Plays each lock in turn, letting the piece's lock delay run out so it scores no drop points, and
 * returns the points each lock scored. `setup` changes the state of the fresh game first.
 */
function play(locks: readonly Lock[], setup: Setup = (state) => state) {
  let engine: Engine = restoreEngine(setup(newEngine().serialize()));
  const points: number[] = [];
  for (const { board, piece, turn } of locks) {
    const current = engine.serialize();
    const placed = withActive(board ? withBoard(current, board) : current, piece);
    const state = { ...placed, lastTurn: turn ?? null };
    const before = state.score;
    engine = restoreEngine(state);
    engine.step(state.frame + LOCK_DELAY, []);
    expect(engine.state.piecesPlaced, 'the piece should have locked').toBe(state.piecesPlaced + 1);
    points.push(engine.state.score - before);
  }
  return { engine, points };
}

function atLevel(level: number): Setup {
  return (state) => ({ ...state, level });
}

/** `count` rows full but for column 10, the well. */
function well(count: number): string[] {
  return Array.from({ length: count }, () => 'LLLLLLLLL.');
}

/** An I standing in the well on the floor: it clears every well row up to 4. */
const I_IN_WELL: ActivePiece = { kind: 'I', col: 7, row: 3, rotation: 1 };

/** A lock that clears nothing: an O on the floor of an empty board, in the corner. */
const NO_CLEAR: Lock = { board: [], piece: { kind: 'O', col: 0, row: 1, rotation: 0 } };

/** An I clearing `lines` well rows, with a cell above them so the board isn't left empty. */
function clearing(lines: number): Lock {
  return { board: ['L.........', ...well(lines)], piece: I_IN_WELL };
}

const SINGLE = clearing(1);
const TETRIS = clearing(4);
/** A Tetris that leaves the board empty. */
const TETRIS_PERFECT_CLEAR: Lock = { board: well(4), piece: I_IN_WELL };

const CLEARS = [
  { name: 'single', lines: 1, points: 100 },
  { name: 'double', lines: 2, points: 300 },
  { name: 'triple', lines: 3, points: 500 },
  { name: 'Tetris', lines: 4, points: 800 },
];

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
  test.each(CLEARS)('a $name scores $points at level 1', ({ lines, points }) => {
    const { engine, points: scored } = play([clearing(lines)]);
    expect(scored).toEqual([points]);
    expect(engine.state.linesCleared).toBe(lines);
  });

  test('score their points times the level', () => {
    expect(play([SINGLE], atLevel(3)).points).toEqual([300]);
    expect(play([TETRIS], atLevel(3)).points).toEqual([2400]);
  });
});

describe('back-to-back', () => {
  test('a Tetris after a Tetris scores half as much again, 1200, with a lock between that clears nothing', () => {
    const { engine, points } = play([TETRIS, NO_CLEAR, TETRIS]);
    expect(points).toEqual([800, 0, 1200]);
    expect(engine.state.backToBack).toBe(true);
  });

  test.each(CLEARS.slice(0, 3))(
    'a $name between two Tetrises breaks the chain',
    ({ lines, points }) => {
      const { points: scored } = play([TETRIS, NO_CLEAR, clearing(lines), NO_CLEAR, TETRIS]);
      expect(scored).toEqual([800, 0, points, 0, 800]);
    },
  );

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
    expect(play([SINGLE, SINGLE, SINGLE], atLevel(2)).points).toEqual([200, 300, 400]);
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
    { name: 'Tetris', ...TETRIS_PERFECT_CLEAR, points: 800 + 2000 },
  ] satisfies (Lock & { name: string; points: number })[])(
    'a $name that empties the board scores the perfect clear bonus on top: $points',
    ({ board, piece, points }) => {
      const { engine, points: scored } = play([{ board, piece }]);
      expect(scored).toEqual([points]);
      expect(isEmpty(engine.state.board)).toBe(true);
    },
  );

  test('a back-to-back Tetris perfect clear scores 3200 on top', () => {
    expect(play([TETRIS, NO_CLEAR, TETRIS_PERFECT_CLEAR]).points).toEqual([800, 0, 1200 + 3200]);
  });

  test('the bonus is times the level', () => {
    expect(play([TETRIS_PERFECT_CLEAR], atLevel(2)).points).toEqual([5600]);
  });
});

describe('drops', () => {
  /** A fresh game with a T in play, its flat side 10 rows above the floor. */
  function fallingT(setup: Setup = (state) => state) {
    const state = setup(newEngine().serialize());
    return restoreEngine(withActive(state, { kind: 'T', col: 3, row: 11, rotation: 0 }));
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
    const engine = fallingT((state) => ({ ...withBoard(state, ['ZZZ...ZZZZ']), level: 2 }));
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

describe('T-spins', () => {
  const IN_PLACE: Turn = { quarterTurns: 1, kick: [0, 0] };

  /** A T turned in place into a slot: pointing down under an overhang, both front corners filled. */
  function tSpin(board: readonly string[]): Lock {
    return { board, piece: { kind: 'T', col: 1, row: 2, rotation: 2 }, turn: IN_PLACE };
  }

  /** A T turned in place onto the floor at the left wall, only the corner over its right arm filled. */
  function mini(board: readonly string[]): Lock {
    return { board, piece: { kind: 'T', col: 0, row: 1, rotation: 0 }, turn: IN_PLACE };
  }

  const T_SPIN_ZERO = tSpin(['LL........', 'L...LLLLL.', 'LL.LLLLLL.']);
  const T_SPIN_SINGLE = tSpin(['LL........', 'L...LLLLL.', 'LL.LLLLLLL']);
  const T_SPIN_DOUBLE = tSpin(['LL........', 'L...LLLLLL', 'LL.LLLLLLL']);
  const T_SPIN_TRIPLE: Lock = {
    board: ['LL........', 'L.........', 'L.LLLLLLLL', 'L..LLLLLLL', 'L.LLLLLLLL'],
    piece: { kind: 'T', col: 0, row: 2, rotation: 1 },
    turn: { quarterTurns: 1, kick: [-1, -2] },
  };
  const MINI_ZERO = mini(['..L.......', '...LLLLLL.']);
  const MINI_SINGLE = mini(['..L.......', '...LLLLLLL']);
  /** Pointing right from the left wall: the wall fills its back corners, the stack one front one. */
  const MINI_DOUBLE: Lock = {
    board: ['..L.......', '..LLLLLLLL', '.LLLLLLLLL'],
    piece: { kind: 'T', col: -1, row: 2, rotation: 1 },
    turn: IN_PLACE,
  };

  test.each([
    { name: 'mini T-spin zero', lock: MINI_ZERO, lines: 0, points: 100 },
    { name: 'mini T-spin single', lock: MINI_SINGLE, lines: 1, points: 200 },
    { name: 'mini T-spin double', lock: MINI_DOUBLE, lines: 2, points: 400 },
    { name: 'T-spin zero', lock: T_SPIN_ZERO, lines: 0, points: 400 },
    { name: 'T-spin single', lock: T_SPIN_SINGLE, lines: 1, points: 800 },
    { name: 'T-spin double', lock: T_SPIN_DOUBLE, lines: 2, points: 1200 },
    { name: 'T-spin triple', lock: T_SPIN_TRIPLE, lines: 3, points: 1600 },
  ])('a $name scores $points at level 1', ({ lock, lines, points }) => {
    const { engine, points: scored } = play([lock]);
    expect(scored).toEqual([points]);
    expect(engine.state.linesCleared).toBe(lines);
  });

  test('score their points times the level', () => {
    expect(play([T_SPIN_ZERO], atLevel(2)).points).toEqual([800]);
    expect(play([T_SPIN_DOUBLE], atLevel(2)).points).toEqual([2400]);
  });

  test('the same T placed without a turn scores as a plain clear', () => {
    expect(play([{ ...T_SPIN_DOUBLE, turn: undefined }]).points).toEqual([300]);
  });

  test('a T-spin zero ends the combo', () => {
    const { engine, points } = play([SINGLE, T_SPIN_ZERO, SINGLE]);
    expect(points).toEqual([100, 400, 100]);
    expect(engine.state.combo).toBe(0);
  });

  describe('back-to-back', () => {
    test('a T-spin clear after a T-spin clear scores half as much again', () => {
      expect(play([T_SPIN_DOUBLE, NO_CLEAR, T_SPIN_DOUBLE]).points).toEqual([1200, 0, 1800]);
    });

    test('carries from a Tetris to a T-spin clear and back', () => {
      const { points } = play([TETRIS, NO_CLEAR, T_SPIN_SINGLE, NO_CLEAR, TETRIS]);
      expect(points).toEqual([800, 0, 1200, 0, 1200]);
    });

    test('a mini T-spin clear is a difficult clear too', () => {
      expect(play([MINI_SINGLE, NO_CLEAR, TETRIS]).points).toEqual([200, 0, 1200]);
      expect(play([TETRIS, NO_CLEAR, MINI_DOUBLE]).points).toEqual([800, 0, 600]);
    });

    test('a single, double or triple breaks the chain between T-spin clears', () => {
      const { engine, points } = play([T_SPIN_DOUBLE, NO_CLEAR, SINGLE, NO_CLEAR, T_SPIN_DOUBLE]);
      expect(points).toEqual([1200, 0, 100, 0, 1200]);
      expect(engine.state.backToBack).toBe(true);
    });

    test('a T-spin zero neither breaks the chain nor scores the bonus', () => {
      const { engine, points } = play([TETRIS, T_SPIN_ZERO, MINI_ZERO, TETRIS]);
      expect(points).toEqual([800, 400, 100, 1200]);
      expect(engine.state.backToBack).toBe(true);
    });
  });

  test('a back-to-back T-spin triple perfect clear scores the triple perfect clear bonus', () => {
    const TST_PERFECT_CLEAR: Lock = {
      ...T_SPIN_TRIPLE,
      board: ['L.LLLLLLLL', 'L..LLLLLLL', 'L.LLLLLLLL'],
    };
    const { engine, points } = play([TETRIS, NO_CLEAR, TST_PERFECT_CLEAR]);
    expect(points).toEqual([800, 0, 2400 + 1800]);
    expect(isEmpty(engine.state.board)).toBe(true);
  });
});
