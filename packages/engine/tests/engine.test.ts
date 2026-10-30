import { describe, expect, test } from 'vitest';
import {
  type ActivePiece,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  createEngine,
  DEFAULT_MODE_SETTINGS,
  type EngineState,
  PIECE_KINDS,
  type PieceKind,
  restoreEngine,
  SUBROWS_PER_ROW,
} from '../src/index';
import { emptyRows, render, withBoard } from './support/board';
import { draw } from './support/random';

const SEED = 2026;

function newEngine(seed = SEED) {
  return createEngine(DEFAULT_MODE_SETTINGS, seed, 0);
}

/** An engine whose state is a fresh game's, changed by `patch`. */
function engineWith(patch: (state: EngineState) => EngineState) {
  return restoreEngine(patch(newEngine().serialize()));
}

function at(active: ActivePiece) {
  return (state: EngineState): EngineState => ({ ...state, active });
}

/** An O out of the way at the left wall, with `kind` next in the queue. */
function nextPieceIs(kind: PieceKind) {
  return (state: EngineState): EngineState => ({
    ...at({ kind: 'O', col: 0, row: 10 })(state),
    queue: [kind, ...state.queue.slice(1)],
  });
}

describe('a new engine', () => {
  test('has an empty 10 × 40 board', () => {
    const { board } = newEngine().state;
    expect(board).toHaveLength(BOARD_HEIGHT);
    for (const row of board) {
      expect(row).toHaveLength(BOARD_WIDTH);
      expect(row.every((cell) => cell === null)).toBe(true);
    }
  });

  test('takes its active piece and 5-piece preview from the seeded bag', () => {
    const expected = draw(SEED, 6);
    const { active, queue } = newEngine().state;
    expect([active.kind, ...queue]).toEqual(expected);
  });

  test('starts at frame 0, not topped out', () => {
    const { frame, toppedOut } = newEngine().state;
    expect(frame).toBe(0);
    expect(toppedOut).toBe(false);
  });

  test('spawns its first piece in rows 21–22 and drops it into rows 20–21', () => {
    const engine = newEngine();
    const picture = render(engine.state);
    const pieceRows = picture
      .map((line, index) => ({ line, row: 22 - index }))
      .filter(({ line }) => /[a-z]/.test(line))
      .map(({ row }) => row);
    expect(Math.max(...pieceRows)).toBeLessThanOrEqual(21);
    expect(Math.min(...pieceRows)).toBe(20);
    expect(picture.slice(3)).toEqual(emptyRows(19));
  });
});

describe('gravity', () => {
  test('pulls the active piece down one row per second (60 frames)', () => {
    const engine = newEngine();
    const start = engine.state.active.row;
    engine.step(59, []);
    expect(engine.state.active.row).toBe(start);
    engine.step(60, []);
    expect(engine.state.active.row).toBe(start - 1);
    engine.step(180, []);
    expect(engine.state.active.row).toBe(start - 3);
  });

  test('follows the mode settings', () => {
    const engine = createEngine({ gravity: 2 * 65_536 }, SEED, 0);
    const start = engine.state.active.row;
    engine.step(29, []);
    expect(engine.state.active.row).toBe(start);
    engine.step(30, []);
    expect(engine.state.active.row).toBe(start - 1);
  });

  test('can move a piece several rows in one frame (20G)', () => {
    const engine = createEngine({ gravity: 20 * SUBROWS_PER_ROW }, SEED, 0);
    const kind = engine.state.active.kind;
    engine.step(1, []);
    // The piece fell from row 20 to the floor and locked in the same frame.
    expect(render(engine.state, 2).join('')).toMatch(new RegExp(kind as string));
  });

  test('step advances the frame counter to the requested frame', () => {
    const engine = newEngine();
    engine.step(10, []);
    expect(engine.state.frame).toBe(10);
  });
});

describe('moving', () => {
  test('moveLeft and moveRight shift the active piece one column at their frame', () => {
    const engine = engineWith(at({ kind: 'T', col: 4, row: 10 }));
    engine.step(5, [{ frame: 5, type: 'moveLeft' }]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 3, row: 10 });
    engine.step(7, [
      { frame: 6, type: 'moveRight' },
      { frame: 7, type: 'moveRight' },
    ]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 5, row: 10 });
  });

  test('several actions in one frame all apply, in order', () => {
    const engine = engineWith(at({ kind: 'T', col: 4, row: 10 }));
    engine.step(1, [
      { frame: 1, type: 'moveLeft' },
      { frame: 1, type: 'moveLeft' },
      { frame: 1, type: 'moveRight' },
    ]);
    expect(engine.state.active.col).toBe(3);
  });

  const walls: Record<PieceKind, { left: string; right: string }> = {
    I: { left: 'iiii......', right: '......iiii' },
    O: { left: 'oo........', right: '........oo' },
    T: { left: 'ttt.......', right: '.......ttt' },
    S: { left: 'ss........', right: '.......ss.' },
    Z: { left: '.zz.......', right: '........zz' },
    J: { left: 'jjj.......', right: '.......jjj' },
    L: { left: 'lll.......', right: '.......lll' },
  };

  test.each(PIECE_KINDS)('%s stops at both walls', (kind) => {
    const toLeft = engineWith(at({ kind, col: 4, row: 10 }));
    toLeft.step(9, moves('moveLeft', 9));
    expect(render(toLeft.state)[22 - 11]).toBe(walls[kind].left);

    const toRight = engineWith(at({ kind, col: 4, row: 10 }));
    toRight.step(9, moves('moveRight', 9));
    expect(render(toRight.state)[22 - 11]).toBe(walls[kind].right);
  });

  test('a move into the stack does nothing', () => {
    const engine = engineWith((state) => ({
      ...withBoard(state, ['.......L..', '.......L..', ...emptyRows(10)]),
      active: { kind: 'O', col: 4, row: 10 },
    }));
    // The stack beside the O's rows leaves room for one move right.
    engine.step(3, [
      { frame: 1, type: 'moveRight' },
      { frame: 2, type: 'moveRight' },
      { frame: 3, type: 'moveRight' },
    ]);
    expect(engine.state.active.col).toBe(5);
  });

  test('actions apply before gravity in the same frame', () => {
    // The O sits above a locked cell under its right column. Gravity at frame 60 lands it there
    // unless the move at frame 60 takes it clear first.
    const board = withBoard(newEngine().serialize(), ['.....L....']).board;
    const start = (state: EngineState): EngineState => ({
      ...state,
      board,
      active: { kind: 'O', col: 4, row: 2 },
    });
    const stays = engineWith(start);
    stays.step(60, []);
    expect(stays.state.board[1]?.[4]).toBe('O');

    const escapes = engineWith(start);
    escapes.step(60, [{ frame: 60, type: 'moveLeft' }]);
    expect(escapes.state.active).toEqual({ kind: 'O', col: 3, row: 1 });
  });
});

describe('step', () => {
  test('rejects actions outside the frames it advances through, changing nothing', () => {
    const engine = newEngine();
    engine.step(10, []);
    const before = engine.serialize();
    expect(() => engine.step(20, [{ frame: 10, type: 'moveLeft' }])).toThrow(RangeError);
    expect(() => engine.step(20, [{ frame: 21, type: 'moveLeft' }])).toThrow(RangeError);
    expect(engine.serialize()).toEqual(before);
  });

  test('rejects actions out of frame order', () => {
    expect(() =>
      newEngine().step(5, [
        { frame: 3, type: 'moveLeft' },
        { frame: 2, type: 'moveLeft' },
      ]),
    ).toThrow(RangeError);
  });

  test('rejects going back in time and fractional frames', () => {
    const engine = newEngine();
    engine.step(10, []);
    expect(() => engine.step(9, [])).toThrow(RangeError);
    expect(() => engine.step(10.5, [])).toThrow(RangeError);
    expect(() => engine.step(12, [{ frame: 11.5, type: 'moveLeft' }])).toThrow(RangeError);
  });

  test('to the current frame is a no-op', () => {
    const engine = newEngine();
    engine.step(10, []);
    const before = engine.serialize();
    engine.step(10, []);
    expect(engine.serialize()).toEqual(before);
  });
});

/** `count` of the same move, one per frame from frame 1. */
function moves(type: 'moveLeft' | 'moveRight', count: number) {
  return Array.from({ length: count }, (_, i) => ({ frame: i + 1, type }));
}

describe('hard drop', () => {
  test('drops the piece to the floor and locks it at its frame', () => {
    const engine = engineWith(at({ kind: 'T', col: 4, row: 15 }));
    engine.step(1, [{ frame: 1, type: 'hardDrop' }]);
    expect(render(engine.state, 2)).toEqual(['....T.....', '...TTT....']);
  });

  test('lands on the stack', () => {
    const engine = engineWith((state) => ({
      ...withBoard(state, ['.....J....', '.....J....', '.....JJ...']),
      active: { kind: 'O', col: 4, row: 15 },
    }));
    engine.step(1, [{ frame: 1, type: 'hardDrop' }]);
    expect(render(engine.state, 5)).toEqual([
      '....OO....',
      '....OO....',
      '.....J....',
      '.....J....',
      '.....JJ...',
    ]);
  });

  test('brings in the next piece and refills the preview from the bag', () => {
    const engine = newEngine();
    const sequence = draw(SEED, 8);
    engine.step(1, [{ frame: 1, type: 'hardDrop' }]);
    expect(engine.state.active.kind).toBe(sequence[1]);
    expect(engine.state.queue).toEqual(sequence.slice(2, 7));
    engine.step(2, [{ frame: 2, type: 'hardDrop' }]);
    expect(engine.state.active.kind).toBe(sequence[2]);
    expect(engine.state.queue).toEqual(sequence.slice(3, 8));
  });

  test('later actions in the same frame move the next piece', () => {
    const engine = engineWith(nextPieceIs('T'));
    engine.step(1, [
      { frame: 1, type: 'hardDrop' },
      { frame: 1, type: 'moveRight' },
    ]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 5, row: 19 });
  });
});

describe('spawning', () => {
  const spawns: Record<PieceKind, [string, string]> = {
    I: ['..........', '...iiii...'],
    O: ['....oo....', '....oo....'],
    T: ['....t.....', '...ttt....'],
    S: ['....ss....', '...ss.....'],
    Z: ['...zz.....', '....zz....'],
    J: ['...j......', '...jjj....'],
    L: ['.....l....', '...lll....'],
  };

  test.each(PIECE_KINDS)('%s spawns in its guideline columns, one row into view', (kind) => {
    const engine = engineWith(nextPieceIs(kind));
    engine.step(1, [{ frame: 1, type: 'hardDrop' }]);
    // Rows 22 down to 20: the piece is in rows 20–21, and row 22 is empty.
    expect(render(engine.state).slice(0, 3)).toEqual(['..........', ...spawns[kind]]);
  });

  test('a piece with the stack right below its spawn stays in rows 21–22', () => {
    const engine = engineWith((state) => ({
      ...withBoard(state, ['LLLLLLLL..', ...emptyRows(19)]),
      active: { kind: 'O', col: 8, row: 10 },
      queue: ['T', ...state.queue.slice(1)],
    }));
    // The O falls clear of the stack. The T spawns on top of row 20, can't drop and locks there,
    // so the next piece blocks out on it (and is drawn over it): read the locked cells alone.
    engine.step(1, [{ frame: 1, type: 'hardDrop' }]);
    const locked = (row: number) => engine.state.board[row]?.map((cell) => cell ?? '.').join('');
    expect([locked(21), locked(20), locked(19)]).toEqual([
      '....T.....',
      '...TTT....',
      'LLLLLLLL..',
    ]);
    expect(engine.state.toppedOut).toBe(true);
  });
});

describe('line clears', () => {
  test('a full row clears and the rows above move down', () => {
    const engine = engineWith((state) => ({
      ...withBoard(state, ['..S.......', 'ZZZ...ZZZZ']),
      active: { kind: 'T', col: 4, row: 10 },
    }));
    engine.step(1, [{ frame: 1, type: 'hardDrop' }]);
    expect(render(engine.state, 3)).toEqual(['..........', '..........', '..S.T.....']);
  });

  test('two full rows clear at once', () => {
    const engine = engineWith((state) => ({
      ...withBoard(state, ['J.........', 'LLLL..LLLL', 'ZZZZ..ZZZZ']),
      active: { kind: 'O', col: 4, row: 10 },
    }));
    engine.step(1, [{ frame: 1, type: 'hardDrop' }]);
    expect(render(engine.state, 3)).toEqual(['..........', '..........', 'J.........']);
  });

  test('only full rows clear', () => {
    const engine = engineWith((state) => ({
      ...withBoard(state, ['LLLL...LLL', 'ZZZZ...ZZZ']),
      active: { kind: 'J', col: 5, row: 10 },
    }));
    // The J's flat side completes the bottom row. Its corner goes into the row above, which keeps
    // its gaps and moves down.
    engine.step(1, [{ frame: 1, type: 'hardDrop' }]);
    expect(render(engine.state, 2)).toEqual(['..........', 'LLLLJ..LLL']);
  });
});

describe('block out', () => {
  function blockedEngine() {
    // The stack reaches into the spawn rows, so the next piece can't appear.
    return engineWith((state) => ({
      ...withBoard(state, ['....L.....', '....L.....', ...emptyRows(20)]),
      active: { kind: 'O', col: 0, row: 10 },
    }));
  }

  test('a piece spawning onto the stack tops out the player', () => {
    const engine = blockedEngine();
    engine.step(1, [{ frame: 1, type: 'hardDrop' }]);
    expect(engine.state.toppedOut).toBe(true);
    // The active piece stays where it failed to spawn, overlapping the stack.
    expect(engine.state.active).toMatchObject({ col: 4, row: 20 });
  });

  test('stops the clock at the frame of the top-out', () => {
    const engine = blockedEngine();
    engine.step(100, [{ frame: 40, type: 'hardDrop' }]);
    expect(engine.state.frame).toBe(40);
  });

  test('step after a top-out changes nothing', () => {
    const engine = blockedEngine();
    engine.step(1, [{ frame: 1, type: 'hardDrop' }]);
    const before = engine.serialize();
    engine.step(500, [
      { frame: 2, type: 'moveLeft' },
      { frame: 3, type: 'hardDrop' },
    ]);
    expect(engine.serialize()).toEqual(before);
  });
});

describe('createEngine', () => {
  test('rejects gravity that is not a positive whole number of sub-rows', () => {
    for (const gravity of [0, -65_536, 0.5, Number.NaN]) {
      expect(() => createEngine({ gravity }, SEED, 0)).toThrow(RangeError);
    }
  });

  test('rejects a player index that is not a non-negative integer', () => {
    for (const playerIndex of [-1, 1.5]) {
      expect(() => createEngine(DEFAULT_MODE_SETTINGS, SEED, playerIndex)).toThrow(RangeError);
    }
  });
});
