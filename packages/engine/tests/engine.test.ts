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
  pieceCells,
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

/** Puts `active` in play as if it had just spawned there. */
function at(active: ActivePiece) {
  const lowestRow = Math.min(...pieceCells(active).map(({ row }) => row));
  return (state: EngineState): EngineState => ({ ...state, active, lowestRow });
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
    // The piece fell from row 20 to the floor in one frame.
    expect(render(engine.state, 2).join('')).toMatch(new RegExp(kind.toLowerCase()));
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
    // Gravity lands the O on a locked cell under its right column at frame 60, and locks it there
    // at frame 90 unless the move at frame 90 takes it clear first.
    const board = withBoard(newEngine().serialize(), ['.....L....']).board;
    const start = (state: EngineState): EngineState => ({
      ...state,
      board,
      active: { kind: 'O', col: 4, row: 2 },
    });
    const stays = engineWith(start);
    stays.step(90, []);
    expect(stays.state.board[1]?.[4]).toBe('O');

    const escapes = engineWith(start);
    escapes.step(90, [{ frame: 90, type: 'moveLeft' }]);
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

describe('lock delay', () => {
  /** The locked cells of the bottom `rows` rows, without the active piece. */
  function locked(engine: ReturnType<typeof newEngine>, rows = 2) {
    return render({ ...engine.state, active: { kind: 'O', col: 0, row: 30 } }, rows);
  }

  test('locks a landed piece 30 frames after it lands', () => {
    // Gravity lands the T on the floor at frame 60.
    const engine = engineWith(at({ kind: 'T', col: 4, row: 1 }));
    engine.step(60, []);
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 0 });
    engine.step(89, []);
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 0 });
    expect(locked(engine)).toEqual(emptyRows(2));
    engine.step(90, []);
    expect(locked(engine)).toEqual(['....T.....', '...TTT....']);
  });

  test('a move restarts the 30 frames', () => {
    const engine = engineWith(at({ kind: 'T', col: 4, row: 0 }));
    engine.step(49, [{ frame: 20, type: 'moveLeft' }]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 3, row: 0 });
    engine.step(50, []);
    expect(locked(engine)).toEqual(['...T......', '..TTT.....']);
  });

  test('only the first 15 moves restart it', () => {
    // 16 moves, one every 10 frames from frame 10. The 15th, at frame 150, is the last that
    // counts, so the piece locks at frame 180 rather than 190.
    const engine = engineWith(at({ kind: 'T', col: 4, row: 0 }));
    engine.step(179, wiggles(16, 10));
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 0 });
    engine.step(180, []);
    expect(locked(engine)).toEqual(['....T.....', '...TTT....']);
  });

  test('moves in the air use none of the 15 restarts', () => {
    // The T makes 16 moves in the air, then slides onto a ledge in the same row at frame 19.
    // It still has its restarts there: the move at frame 40 restarts the lock delay.
    const engine = engineWith((state) =>
      at({ kind: 'T', col: 7, row: 1 })(withBoard(state, ['LLLL......'])),
    );
    const slideOn = [17, 18, 19].map((frame) => ({ frame, type: 'moveLeft' as const }));
    engine.step(69, [...wiggles(16, 1), ...slideOn, { frame: 40, type: 'moveLeft' }]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 3, row: 1 });
    engine.step(70, []);
    expect(locked(engine, 3)).toEqual(['...T......', '..TTT.....', 'LLLL......']);
  });

  test('reaching a new lowest row gives the piece its 30 frames and 15 resets again', () => {
    // The T rests on a ledge and uses its 15 resets there, then slides off at frame 163 and soft
    // drops to the floor at frame 164. There it gets a fresh lock delay, and its move at frame 190
    // restarts it again, so it locks at frame 220.
    const engine = engineWith((state) =>
      at({ kind: 'T', col: 2, row: 1 })(withBoard(state, ['LLLL......'])),
    );
    const slideOff = [160, 161, 162, 163].map((frame) => ({ frame, type: 'moveRight' as const }));
    engine.step(219, [
      ...wiggles(15, 10),
      ...slideOff,
      { frame: 164, type: 'softDrop' },
      { frame: 190, type: 'moveRight' },
    ]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 6, row: 0 });
    engine.step(220, []);
    expect(locked(engine)).toEqual(['......T...', 'LLLL.TTT..']);
  });
});

/** `count` moves alternating left and right, one every `every` frames from frame `every`. */
function wiggles(count: number, every: number) {
  return Array.from({ length: count }, (_, i) => ({
    frame: (i + 1) * every,
    type: i % 2 === 0 ? ('moveLeft' as const) : ('moveRight' as const),
  }));
}

describe('soft drop', () => {
  test('moves the active piece down one row at its frame', () => {
    const engine = engineWith(at({ kind: 'T', col: 4, row: 10 }));
    engine.step(2, [
      { frame: 1, type: 'softDrop' },
      { frame: 2, type: 'softDrop' },
    ]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 8 });
  });

  test('does nothing when the piece is on the stack', () => {
    const engine = engineWith(at({ kind: 'T', col: 4, row: 0 }));
    engine.step(1, [{ frame: 1, type: 'softDrop' }]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 0 });
    expect(render(engine.state, 2)).toEqual(['....t.....', '...ttt....']);
  });
});

describe('hold', () => {
  test('starts empty', () => {
    expect(newEngine().state.hold).toBeNull();
  });

  test('into an empty hold, keeps the active piece and brings in the next one from the queue', () => {
    const sequence = draw(SEED, 7);
    const engine = newEngine();
    engine.step(1, [{ frame: 1, type: 'hold' }]);
    expect(engine.state.hold).toBe(sequence[0]);
    expect(engine.state.active).toMatchObject({ kind: sequence[1], col: 4, row: 19 });
    expect(engine.state.queue).toEqual(sequence.slice(2, 7));
  });

  test('works once per piece', () => {
    const sequence = draw(SEED, 2);
    const engine = newEngine();
    engine.step(2, [
      { frame: 1, type: 'hold' },
      { frame: 2, type: 'hold' },
    ]);
    expect(engine.state.hold).toBe(sequence[0]);
    expect(engine.state.active.kind).toBe(sequence[1]);
  });

  test('works again after the next lock, swapping the held piece back in at the spawn', () => {
    const sequence = draw(SEED, 8);
    const engine = newEngine();
    engine.step(3, [
      { frame: 1, type: 'hold' },
      { frame: 2, type: 'hardDrop' },
      { frame: 3, type: 'hold' },
    ]);
    expect(engine.state.hold).toBe(sequence[2]);
    expect(engine.state.active).toMatchObject({ kind: sequence[0], col: 4, row: 19 });
    expect(engine.state.queue).toEqual(sequence.slice(3, 8));
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
    // The O falls clear of the stack, and the T spawns on top of row 20 and can't drop.
    engine.step(1, [{ frame: 1, type: 'hardDrop' }]);
    expect(render(engine.state).slice(0, 3)).toEqual(['....t.....', '...ttt....', 'LLLLLLLL..']);
    expect(engine.state.toppedOut).toBe(false);
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

describe('lock out', () => {
  /** A stack up to row `top` with a gap at the right, and `kind` about to spawn above it. */
  function stackTo(top: number, kind: PieceKind) {
    return engineWith((state) => ({
      ...withBoard(state, ['LLLLLLLL..', ...emptyRows(top - 1)]),
      active: { kind: 'O', col: 8, row: 10 },
      queue: [kind, ...state.queue.slice(1)],
    }));
  }

  test('a piece that locks entirely above row 20 tops out the player', () => {
    // The O falls clear of the stack, and the T spawns on top of row 20 and locks there.
    const engine = stackTo(20, 'T');
    engine.step(2, [
      { frame: 1, type: 'hardDrop' },
      { frame: 2, type: 'hardDrop' },
    ]);
    const locked = (row: number) => engine.state.board[row]?.map((cell) => cell ?? '.').join('');
    expect([locked(21), locked(20)]).toEqual(['....T.....', '...TTT....']);
    expect(engine.state.toppedOut).toBe(true);
    // The game stops at the lock: the T stays the active piece, and no next piece spawns.
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 20 });
  });

  test('also when the lock delay runs out', () => {
    const engine = stackTo(20, 'T');
    engine.step(100, [{ frame: 1, type: 'hardDrop' }]);
    expect(engine.state.toppedOut).toBe(true);
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 20 });
    expect(engine.state.frame).toBe(31);
  });

  test('a piece that locks with a cell in row 20 does not', () => {
    // The I drops into row 20 on top of row 19 and locks there. The next piece spawns above it.
    const engine = stackTo(19, 'I');
    engine.step(2, [
      { frame: 1, type: 'hardDrop' },
      { frame: 2, type: 'hardDrop' },
    ]);
    expect(engine.state.board[19]?.map((cell) => cell ?? '.').join('')).toBe('...IIII...');
    expect(engine.state.toppedOut).toBe(false);
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
