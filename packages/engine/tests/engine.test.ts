import { describe, expect, test } from 'vitest';
import {
  ActionType,
  type ActivePiece,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  createEngine,
  DEFAULT_MODE_SETTINGS,
  PIECE_KINDS,
  type PieceKind,
  restoreEngine,
  SUBROWS_PER_ROW,
} from '../src/index';
import { bottomRow } from '../src/pieces';
import { emptyRows, render, renderLocked, withBoard } from './support/board';
import { draw } from './support/random';

const SEED = 2026;

function newEngine(seed = SEED) {
  return createEngine(DEFAULT_MODE_SETTINGS, seed, 0);
}

/**
 * A fresh game changed to have `board` (a picture, as `withBoard` takes), `active` in play as if it
 * had just spawned there, and `next` as the next piece in the queue.
 */
function game({ board = [], active, next }: GameSetup) {
  const state = withBoard(newEngine().serialize(), board);
  if (active) {
    state.active = active;
    state.lowestRow = bottomRow(active);
  }
  if (next) state.queue[0] = next;
  return restoreEngine(state);
}

interface GameSetup {
  board?: readonly string[];
  active?: ActivePiece;
  next?: PieceKind;
}

/** `kind` next in the queue, with an O in play out of the way at the left wall. */
function nextPieceIs(kind: PieceKind) {
  return game({ active: { kind: 'O', col: 0, row: 10, rotation: 0 }, next: kind });
}

/**
 * A stack up to row `top` with a gap at the right, an O in play above the gap, and `kind` next.
 * A hard drop puts the O in the gap and spawns `kind` above the stack.
 */
function stackTo(top: number, kind: PieceKind) {
  return game({
    board: ['LLLLLLLL..', ...emptyRows(top - 1)],
    active: { kind: 'O', col: 8, row: 10, rotation: 0 },
    next: kind,
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

  test('builds up nothing on the stack, so a piece that slides off a ledge falls from rest', () => {
    // The T falls for 30 frames, soft drops onto the ledge at frame 30, and slides off it at
    // frame 33. It then needs a full 60 frames of gravity to fall a row.
    const engine = game({
      board: ['LLLL......'],
      active: { kind: 'T', col: 2, row: 2, rotation: 0 },
    });
    engine.step(91, [
      { frame: 30, type: ActionType.SoftDrop },
      ...moves(ActionType.MoveRight, 3, 31),
    ]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 5, row: 1, rotation: 0 });
    engine.step(92, []);
    expect(engine.state.active).toEqual({ kind: 'T', col: 5, row: 0, rotation: 0 });
  });

  test('step advances the frame counter to the requested frame', () => {
    const engine = newEngine();
    engine.step(10, []);
    expect(engine.state.frame).toBe(10);
  });
});

describe('moving', () => {
  test('moveLeft and moveRight shift the active piece one column at their frame', () => {
    const engine = game({ active: { kind: 'T', col: 4, row: 10, rotation: 0 } });
    engine.step(5, [{ frame: 5, type: ActionType.MoveLeft }]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 3, row: 10, rotation: 0 });
    engine.step(7, [
      { frame: 6, type: ActionType.MoveRight },
      { frame: 7, type: ActionType.MoveRight },
    ]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 5, row: 10, rotation: 0 });
  });

  test('several actions in one frame all apply, in order', () => {
    const engine = game({ active: { kind: 'T', col: 4, row: 10, rotation: 0 } });
    engine.step(1, [
      { frame: 1, type: ActionType.MoveLeft },
      { frame: 1, type: ActionType.MoveLeft },
      { frame: 1, type: ActionType.MoveRight },
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
    const toLeft = game({ active: { kind, col: 4, row: 10, rotation: 0 } });
    toLeft.step(9, moves(ActionType.MoveLeft, 9));
    expect(render(toLeft.state)[22 - 11]).toBe(walls[kind].left);

    const toRight = game({ active: { kind, col: 4, row: 10, rotation: 0 } });
    toRight.step(9, moves(ActionType.MoveRight, 9));
    expect(render(toRight.state)[22 - 11]).toBe(walls[kind].right);
  });

  test('a move into the stack does nothing', () => {
    const engine = game({
      board: ['.......L..', '.......L..', ...emptyRows(10)],
      active: { kind: 'O', col: 4, row: 10, rotation: 0 },
    });
    // The stack beside the O's rows leaves room for one move right.
    engine.step(3, [
      { frame: 1, type: ActionType.MoveRight },
      { frame: 2, type: ActionType.MoveRight },
      { frame: 3, type: ActionType.MoveRight },
    ]);
    expect(engine.state.active.col).toBe(5);
  });

  test('actions apply before gravity in the same frame', () => {
    // Gravity lands the O on a locked cell under its right column at frame 60, and locks it there
    // at frame 90 unless the move at frame 90 takes it clear first.
    const start: GameSetup = {
      board: ['.....L....'],
      active: { kind: 'O', col: 4, row: 2, rotation: 0 },
    };
    const stays = game(start);
    stays.step(90, []);
    expect(stays.state.board[1]?.[4]).toBe('O');

    const escapes = game(start);
    escapes.step(90, [{ frame: 90, type: ActionType.MoveLeft }]);
    expect(escapes.state.active).toEqual({ kind: 'O', col: 3, row: 1, rotation: 0 });
  });
});

describe('step', () => {
  test('rejects actions outside the frames it advances through, changing nothing', () => {
    const engine = newEngine();
    engine.step(10, []);
    const before = engine.serialize();
    expect(() => engine.step(20, [{ frame: 10, type: ActionType.MoveLeft }])).toThrow(RangeError);
    expect(() => engine.step(20, [{ frame: 21, type: ActionType.MoveLeft }])).toThrow(RangeError);
    expect(engine.serialize()).toEqual(before);
  });

  test('rejects actions out of frame order', () => {
    expect(() =>
      newEngine().step(5, [
        { frame: 3, type: ActionType.MoveLeft },
        { frame: 2, type: ActionType.MoveLeft },
      ]),
    ).toThrow(RangeError);
  });

  test('rejects going back in time and fractional frames', () => {
    const engine = newEngine();
    engine.step(10, []);
    expect(() => engine.step(9, [])).toThrow(RangeError);
    expect(() => engine.step(10.5, [])).toThrow(RangeError);
    expect(() => engine.step(12, [{ frame: 11.5, type: ActionType.MoveLeft }])).toThrow(RangeError);
  });

  test('to the current frame is a no-op', () => {
    const engine = newEngine();
    engine.step(10, []);
    const before = engine.serialize();
    engine.step(10, []);
    expect(engine.serialize()).toEqual(before);
  });
});

/** `count` of the same move, one per frame from frame `from`. */
function moves(type: ActionType.MoveLeft | ActionType.MoveRight, count: number, from = 1) {
  return Array.from({ length: count }, (_, i) => ({ frame: from + i, type }));
}

describe('hard drop', () => {
  test('drops the piece to the floor and locks it at its frame', () => {
    const engine = game({ active: { kind: 'T', col: 4, row: 15, rotation: 0 } });
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    expect(render(engine.state, 2)).toEqual(['....T.....', '...TTT....']);
  });

  test('lands on the stack', () => {
    const engine = game({
      board: ['.....J....', '.....J....', '.....JJ...'],
      active: { kind: 'O', col: 4, row: 15, rotation: 0 },
    });
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
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
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    expect(engine.state.active.kind).toBe(sequence[1]);
    expect(engine.state.queue).toEqual(sequence.slice(2, 7));
    engine.step(2, [{ frame: 2, type: ActionType.HardDrop }]);
    expect(engine.state.active.kind).toBe(sequence[2]);
    expect(engine.state.queue).toEqual(sequence.slice(3, 8));
  });

  test('later actions in the same frame move the next piece', () => {
    const engine = nextPieceIs('T');
    engine.step(1, [
      { frame: 1, type: ActionType.HardDrop },
      { frame: 1, type: ActionType.MoveRight },
    ]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 5, row: 19, rotation: 0 });
  });
});

describe('lock delay', () => {
  test('locks a landed piece 30 frames after it lands', () => {
    // Gravity lands the T on the floor at frame 60.
    const engine = game({ active: { kind: 'T', col: 4, row: 1, rotation: 0 } });
    engine.step(60, []);
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 0, rotation: 0 });
    engine.step(89, []);
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 0, rotation: 0 });
    expect(renderLocked(engine.state, 2)).toEqual(emptyRows(2));
    engine.step(90, []);
    expect(renderLocked(engine.state, 2)).toEqual(['....T.....', '...TTT....']);
  });

  test('a move restarts the 30 frames', () => {
    const engine = game({ active: { kind: 'T', col: 4, row: 0, rotation: 0 } });
    engine.step(49, [{ frame: 20, type: ActionType.MoveLeft }]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 3, row: 0, rotation: 0 });
    engine.step(50, []);
    expect(renderLocked(engine.state, 2)).toEqual(['...T......', '..TTT.....']);
  });

  test('only the first 15 moves restart it', () => {
    // 16 moves, one every 10 frames from frame 10. The 15th, at frame 150, is the last that
    // counts, so the piece locks at frame 180 rather than 190.
    const engine = game({ active: { kind: 'T', col: 4, row: 0, rotation: 0 } });
    engine.step(179, wiggles(16, 10));
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 0, rotation: 0 });
    engine.step(180, []);
    expect(renderLocked(engine.state, 2)).toEqual(['....T.....', '...TTT....']);
  });

  test('moves in the air use none of the 15 restarts', () => {
    // The T makes 16 moves in the air, then slides onto a ledge in the same row at frame 19.
    // It still has its restarts there: the move at frame 40 restarts the lock delay.
    const engine = game({
      board: ['LLLL......'],
      active: { kind: 'T', col: 7, row: 1, rotation: 0 },
    });
    engine.step(69, [
      ...wiggles(16, 1),
      ...moves(ActionType.MoveLeft, 3, 17),
      { frame: 40, type: ActionType.MoveLeft },
    ]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 3, row: 1, rotation: 0 });
    engine.step(70, []);
    expect(renderLocked(engine.state, 3)).toEqual(['...T......', '..TTT.....', 'LLLL......']);
  });

  test('reaching a new lowest row gives the piece its 30 frames and 15 resets again', () => {
    // The T rests on a ledge and uses its 15 resets there, then slides off at frame 163 and soft
    // drops to the floor at frame 164. There it gets a fresh lock delay, and its move at frame 190
    // restarts it again, so it locks at frame 220.
    const engine = game({
      board: ['LLLL......'],
      active: { kind: 'T', col: 2, row: 1, rotation: 0 },
    });
    engine.step(219, [
      ...wiggles(15, 10),
      ...moves(ActionType.MoveRight, 4, 160),
      { frame: 164, type: ActionType.SoftDrop },
      { frame: 190, type: ActionType.MoveRight },
    ]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 6, row: 0, rotation: 0 });
    engine.step(220, []);
    expect(renderLocked(engine.state, 2)).toEqual(['......T...', 'LLLL.TTT..']);
  });
});

/** `count` moves alternating left and right, one every `every` frames from frame `every`. */
function wiggles(count: number, every: number) {
  return Array.from({ length: count }, (_, i) => ({
    frame: (i + 1) * every,
    type: i % 2 === 0 ? ActionType.MoveLeft : ActionType.MoveRight,
  }));
}

describe('lock delay with rotation', () => {
  /** A T resting on the floor in state 2, which turns between states 2 and L without kicks. */
  function restingT() {
    return game({ active: { kind: 'T', col: 4, row: 1, rotation: 2 } });
  }

  test('a turn on the stack restarts the 30 frames', () => {
    const engine = restingT();
    engine.step(49, [{ frame: 20, type: ActionType.RotateCW }]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 1, rotation: 3 });
    engine.step(50, []);
    expect(renderLocked(engine.state, 3)).toEqual(['....T.....', '...TT.....', '....T.....']);
  });

  test('turns and moves share the 15 restarts', () => {
    // 8 turns and 8 moves, one every 10 frames from frame 10. The 15th, at frame 150, is the last
    // that counts, so the piece locks at frame 180 rather than 190.
    const engine = restingT();
    const turnsAndMoves = Array.from({ length: 16 }, (_, i) => ({
      frame: (i + 1) * 10,
      type: [ActionType.RotateCW, ActionType.MoveLeft, ActionType.RotateCCW, ActionType.MoveRight][
        i % 4
      ] as ActionType,
    }));
    engine.step(179, turnsAndMoves);
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 1, rotation: 2 });
    engine.step(180, []);
    expect(renderLocked(engine.state, 2)).toEqual(['...TTT....', '....T.....']);
  });

  test('turns in the air use none of the 15 restarts', () => {
    const engine = game({ active: { kind: 'T', col: 4, row: 10, rotation: 0 } });
    engine.step(
      16,
      Array.from({ length: 16 }, (_, i) => ({ frame: i + 1, type: ActionType.RotateCW })),
    );
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 10, rotation: 0 });
    expect(engine.state.lockResets).toBe(0);
  });

  test('a kick down to a new lowest row gives a fresh lock delay with all 15 restarts', () => {
    // The T uses 4 restarts on the stack, then kicks down into a T-spin triple slot.
    const engine = game({
      board: ['LL........', 'L.........', 'L.LLLLLLLL', 'L..LLLLLLL', 'L.LLLLLLLL'],
      active: { kind: 'T', col: 2, row: 3, rotation: 0 },
    });
    engine.step(40, [
      { frame: 10, type: ActionType.MoveRight },
      { frame: 20, type: ActionType.MoveLeft },
      { frame: 30, type: ActionType.MoveRight },
      { frame: 31, type: ActionType.MoveLeft },
      { frame: 40, type: ActionType.RotateCW },
    ]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 1, row: 1, rotation: 1 });
    expect(engine.state.lockResets).toBe(0);
    expect(engine.state.lockTimer).toBe(0);
  });
});

describe('soft drop', () => {
  test('moves the active piece down one row at its frame', () => {
    const engine = game({ active: { kind: 'T', col: 4, row: 10, rotation: 0 } });
    engine.step(2, [
      { frame: 1, type: ActionType.SoftDrop },
      { frame: 2, type: ActionType.SoftDrop },
    ]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 8, rotation: 0 });
  });

  test('does nothing when the piece is on the stack', () => {
    const engine = game({ active: { kind: 'T', col: 4, row: 0, rotation: 0 } });
    engine.step(1, [{ frame: 1, type: ActionType.SoftDrop }]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 0, rotation: 0 });
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
    engine.step(1, [{ frame: 1, type: ActionType.Hold }]);
    expect(engine.state.hold).toBe(sequence[0]);
    expect(engine.state.active).toMatchObject({ kind: sequence[1], col: 4, row: 19, rotation: 0 });
    expect(engine.state.queue).toEqual(sequence.slice(2, 7));
  });

  test('works once per piece', () => {
    const sequence = draw(SEED, 2);
    const engine = newEngine();
    engine.step(2, [
      { frame: 1, type: ActionType.Hold },
      { frame: 2, type: ActionType.Hold },
    ]);
    expect(engine.state.hold).toBe(sequence[0]);
    expect(engine.state.active.kind).toBe(sequence[1]);
  });

  test('works again after the next lock, swapping the held piece back in at the spawn', () => {
    const sequence = draw(SEED, 8);
    const engine = newEngine();
    engine.step(3, [
      { frame: 1, type: ActionType.Hold },
      { frame: 2, type: ActionType.HardDrop },
      { frame: 3, type: ActionType.Hold },
    ]);
    expect(engine.state.hold).toBe(sequence[2]);
    expect(engine.state.active).toMatchObject({ kind: sequence[0], col: 4, row: 19, rotation: 0 });
    expect(engine.state.queue).toEqual(sequence.slice(3, 8));
  });
});

describe('rotation', () => {
  /**
   * The SRS rotation states, as the guideline draws them in each piece's 3 × 3 or 4 × 4 box: spawn
   * (0), one turn clockwise (R), two turns (2) and one turn anticlockwise (L).
   */
  const SRS_STATES: Record<PieceKind, [string[], string[], string[], string[]]> = {
    I: [
      ['....', 'iiii', '....', '....'],
      ['..i.', '..i.', '..i.', '..i.'],
      ['....', '....', 'iiii', '....'],
      ['.i..', '.i..', '.i..', '.i..'],
    ],
    O: [
      ['.oo.', '.oo.', '....', '....'],
      ['.oo.', '.oo.', '....', '....'],
      ['.oo.', '.oo.', '....', '....'],
      ['.oo.', '.oo.', '....', '....'],
    ],
    T: [
      ['.t..', 'ttt.', '....', '....'],
      ['.t..', '.tt.', '.t..', '....'],
      ['....', 'ttt.', '.t..', '....'],
      ['.t..', 'tt..', '.t..', '....'],
    ],
    S: [
      ['.ss.', 'ss..', '....', '....'],
      ['.s..', '.ss.', '..s.', '....'],
      ['....', '.ss.', 'ss..', '....'],
      ['s...', 'ss..', '.s..', '....'],
    ],
    Z: [
      ['zz..', '.zz.', '....', '....'],
      ['..z.', '.zz.', '.z..', '....'],
      ['....', 'zz..', '.zz.', '....'],
      ['.z..', 'zz..', 'z...', '....'],
    ],
    J: [
      ['j...', 'jjj.', '....', '....'],
      ['.jj.', '.j..', '.j..', '....'],
      ['....', 'jjj.', '..j.', '....'],
      ['.j..', '.j..', 'jj..', '....'],
    ],
    L: [
      ['..l.', 'lll.', '....', '....'],
      ['.l..', '.l..', '.ll.', '....'],
      ['....', 'lll.', 'l...', '....'],
      ['ll..', '.l..', '.l..', '....'],
    ],
  };

  /** The piece's box: columns 3–6 of rows 12 down to 9 (board rows 11 to 8), around an origin at column 4, row 10. */
  function box(engine: ReturnType<typeof game>): string[] {
    return render(engine.state)
      .slice(10, 14)
      .map((line) => line.slice(3, 7));
  }

  function inTheAir(kind: PieceKind) {
    return game({ active: { kind, col: 4, row: 10, rotation: 0 } });
  }

  test.each(PIECE_KINDS)(
    '%s spawns in SRS state 0 and turns clockwise through R, 2 and L',
    (kind) => {
      const engine = inTheAir(kind);
      expect(box(engine)).toEqual(SRS_STATES[kind][0]);
      for (const state of [1, 2, 3, 0] as const) {
        engine.step(engine.state.frame + 1, [
          { frame: engine.state.frame + 1, type: ActionType.RotateCW },
        ]);
        expect(box(engine)).toEqual(SRS_STATES[kind][state]);
        expect(engine.state.active.rotation).toBe(state);
      }
    },
  );

  test.each(PIECE_KINDS)('%s turns anticlockwise to L and by 180° to 2', (kind) => {
    const ccw = inTheAir(kind);
    ccw.step(1, [{ frame: 1, type: ActionType.RotateCCW }]);
    expect(box(ccw)).toEqual(SRS_STATES[kind][3]);
    expect(ccw.state.active.rotation).toBe(3);

    const half = inTheAir(kind);
    half.step(1, [{ frame: 1, type: ActionType.Rotate180 }]);
    expect(box(half)).toEqual(SRS_STATES[kind][2]);
    expect(half.state.active.rotation).toBe(2);
  });

  test('a T-spin triple: the T kicks one column left and two rows down into the slot', () => {
    // The T rests in state 0 above the slot. Turning clockwise in place or by the first three
    // kicks is blocked, and the fifth kick, (-1, -2), drops it into the slot under the overhang.
    const engine = game({
      board: ['LL........', 'L.........', 'L.LLLLLLLL', 'L..LLLLLLL', 'L.LLLLLLLL'],
      active: { kind: 'T', col: 2, row: 3, rotation: 0 },
    });
    engine.step(1, [{ frame: 1, type: ActionType.RotateCW }]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 1, row: 1, rotation: 1 });
    engine.step(2, [{ frame: 2, type: ActionType.HardDrop }]);
    expect(renderLocked(engine.state, 3)).toEqual(['..........', 'LL........', 'L.........']);
  });

  test('an I kicks off the left wall', () => {
    // Vertical against the wall, the I can't turn flat in place or one column left. The second
    // kick, (+2, 0), fits.
    const engine = game({ active: { kind: 'I', col: -1, row: 10, rotation: 1 } });
    engine.step(1, [{ frame: 1, type: ActionType.RotateCW }]);
    expect(engine.state.active).toEqual({ kind: 'I', col: 1, row: 10, rotation: 2 });
    expect(render(engine.state)[21 - 9]).toBe('iiii......');
  });

  test('a T on the floor kicks up a row to turn by 180°', () => {
    const engine = game({ active: { kind: 'T', col: 4, row: 0, rotation: 0 } });
    engine.step(1, [{ frame: 1, type: ActionType.Rotate180 }]);
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 1, rotation: 2 });
    expect(render(engine.state, 2)).toEqual(['...ttt....', '....t.....']);
  });

  test('a turn that no kick fits does nothing', () => {
    // The T sits in a hole of its own shape, and the stack blocks the half turn and every kick.
    const engine = game({
      board: ['LLLL.LLLLL', 'LLL...LLLL', 'LLLLLLLLL.'],
      active: { kind: 'T', col: 4, row: 1, rotation: 0 },
    });
    const before = engine.state.active;
    engine.step(1, [{ frame: 1, type: ActionType.Rotate180 }]);
    expect(engine.state.active).toEqual(before);
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
    const engine = nextPieceIs(kind);
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    // Rows 22 down to 20: the piece is in rows 20–21, and row 22 is empty.
    expect(render(engine.state).slice(0, 3)).toEqual(['..........', ...spawns[kind]]);
  });

  test('a piece with the stack right below its spawn stays in rows 21–22', () => {
    const engine = stackTo(20, 'T');
    // The O falls clear of the stack, and the T spawns on top of row 20 and can't drop.
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    expect(render(engine.state).slice(0, 3)).toEqual(['....t.....', '...ttt....', 'LLLLLLLL..']);
    expect(engine.state.toppedOut).toBe(false);
  });
});

describe('line clears', () => {
  test('a full row clears and the rows above move down', () => {
    const engine = game({
      board: ['..S.......', 'ZZZ...ZZZZ'],
      active: { kind: 'T', col: 4, row: 10, rotation: 0 },
    });
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    expect(render(engine.state, 3)).toEqual(['..........', '..........', '..S.T.....']);
  });

  test('two full rows clear at once', () => {
    const engine = game({
      board: ['J.........', 'LLLL..LLLL', 'ZZZZ..ZZZZ'],
      active: { kind: 'O', col: 4, row: 10, rotation: 0 },
    });
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    expect(render(engine.state, 3)).toEqual(['..........', '..........', 'J.........']);
  });

  test('only full rows clear', () => {
    const engine = game({
      board: ['LLLL...LLL', 'ZZZZ...ZZZ'],
      active: { kind: 'J', col: 5, row: 10, rotation: 0 },
    });
    // The J's flat side completes the bottom row. Its corner goes into the row above, which keeps
    // its gaps and moves down.
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    expect(render(engine.state, 2)).toEqual(['..........', 'LLLLJ..LLL']);
  });
});

describe('block out', () => {
  function blockedEngine() {
    // The stack reaches into the spawn rows, so the next piece can't appear.
    return game({
      board: ['....L.....', '....L.....', ...emptyRows(20)],
      active: { kind: 'O', col: 0, row: 10, rotation: 0 },
    });
  }

  test('a piece spawning onto the stack tops out the player', () => {
    const engine = blockedEngine();
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    expect(engine.state.toppedOut).toBe(true);
    // The active piece stays where it failed to spawn, overlapping the stack.
    expect(engine.state.active).toMatchObject({ col: 4, row: 20 });
  });

  test('stops the clock at the frame of the top-out', () => {
    const engine = blockedEngine();
    engine.step(100, [{ frame: 40, type: ActionType.HardDrop }]);
    expect(engine.state.frame).toBe(40);
  });

  test('step after a top-out changes nothing', () => {
    const engine = blockedEngine();
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    const before = engine.serialize();
    engine.step(500, [
      { frame: 2, type: ActionType.MoveLeft },
      { frame: 3, type: ActionType.HardDrop },
    ]);
    expect(engine.serialize()).toEqual(before);
  });
});

describe('lock out', () => {
  test('a piece that locks entirely above row 20 tops out the player', () => {
    // The O falls clear of the stack, and the T spawns on top of row 20 and locks there.
    const engine = stackTo(20, 'T');
    engine.step(2, [
      { frame: 1, type: ActionType.HardDrop },
      { frame: 2, type: ActionType.HardDrop },
    ]);
    expect(renderLocked(engine.state).slice(0, 2)).toEqual(['....T.....', '...TTT....']);
    expect(engine.state.toppedOut).toBe(true);
    // The game stops at the lock: the T stays the active piece, and no next piece spawns.
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 20, rotation: 0 });
  });

  test('also when the lock delay runs out', () => {
    const engine = stackTo(20, 'T');
    engine.step(100, [{ frame: 1, type: ActionType.HardDrop }]);
    expect(engine.state.toppedOut).toBe(true);
    expect(engine.state.active).toEqual({ kind: 'T', col: 4, row: 20, rotation: 0 });
    expect(engine.state.frame).toBe(31);
  });

  test('a piece that locks with a cell in row 20 does not', () => {
    // The I drops into row 20 on top of row 19 and locks there. The next piece spawns above it.
    const engine = stackTo(19, 'I');
    engine.step(2, [
      { frame: 1, type: ActionType.HardDrop },
      { frame: 2, type: ActionType.HardDrop },
    ]);
    expect(renderLocked(engine.state, 20)[0]).toBe('...IIII...');
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
