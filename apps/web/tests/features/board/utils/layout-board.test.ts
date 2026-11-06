import { type Rgb, SKINS, THEMES } from '@shura/client-core';
import {
  createEngine,
  type EngineState,
  type PieceKind,
  SPRINT,
  VISIBLE_ROWS,
} from '@shura/engine';
import { describe, expect, test } from 'vitest';
import {
  type BoardLayout,
  type BoardPart,
  type BoardShape,
  type CellShape,
  GHOST_DRAWING,
  layoutBoard,
  layoutSmallBoard,
  rectStyle,
  SMALL_LAYOUT_CELLS,
} from '@/features/board/utils/layout-board';

const theme = THEMES.indigo;
const skin = SKINS.pixel;

// The piece colours (every theme shares them) and Indigo's garbage, grid and well colours.
const T: Rgb = [200, 107, 250];
const I: Rgb = [62, 224, 255];
const O: Rgb = [255, 210, 63];
const S: Rgb = [92, 242, 122];
const Z: Rgb = [255, 77, 109];
const GARBAGE: Rgb = [138, 128, 168];
const GRID: Rgb = [58, 42, 99];
const WELL: readonly Rgb[] = [
  [23, 12, 46],
  [28, 16, 56],
];

/**
 * A game with an empty board, a T at column 4, row 10 in its spawn rotation (cells (5, 10),
 * (4, 9), (5, 9) and (6, 9)), nothing held, and the given changes.
 */
function game(change: (state: EngineState) => void = () => {}): EngineState {
  const state = createEngine(SPRINT, 1, 0).serialize();
  state.active = { kind: 'T', col: 4, row: 10, rotation: 0 };
  state.hold = null;
  state.holdUsed = false;
  change(state);
  return state;
}

function layout(state: EngineState, { cellSize = 32, ghost = true } = {}): BoardLayout {
  return layoutBoard(state, theme, skin, cellSize, { ghost });
}

function cells(board: BoardLayout, part: BoardPart): CellShape[] {
  return board.shapes.filter(
    (shape): shape is CellShape => shape.type === 'cell' && shape.part === part,
  );
}

/** A well cell's board position (row 0 at the bottom) and colour. */
function onBoard(board: BoardLayout, part: BoardPart) {
  const { well } = board.regions;
  return cells(board, part).map(({ x, y, size, color }) => ({
    col: (x - well.x) / size,
    row: VISIBLE_ROWS - 1 - (y - well.y) / size,
    color,
  }));
}

const byPosition = (a: { col: number; row: number }, b: { col: number; row: number }) =>
  a.row - b.row || a.col - b.col;

describe('layoutBoard', () => {
  test('the well is a 10×20 checker of the theme’s two well colours', () => {
    const board = layout(game());
    const checker = board.shapes.filter((shape) => shape.type === 'rect' && shape.part === 'well');
    expect(checker).toHaveLength(200);
    expect(new Set(checker.map((shape) => shape.color))).toEqual(new Set(WELL));
    const { well } = board.regions;
    expect(well.width).toBe(10 * 32);
    expect(well.height).toBe(20 * 32);
    const at = (x: number, y: number) =>
      checker.find((shape) => shape.x === well.x + x * 32 && shape.y === well.y + y * 32)?.color;
    expect(at(0, 0)).not.toEqual(at(1, 0));
    expect(at(0, 0)).not.toEqual(at(0, 1));
    expect(at(0, 0)).toEqual(at(1, 1));
  });

  test('draws the locked cells where they are, garbage in the theme’s garbage colour', () => {
    const board = layout(
      game((state) => {
        const bottom = state.board[0];
        const top = state.board[19];
        if (!bottom || !top) throw new Error('no such row');
        bottom[0] = 'T';
        bottom[1] = 'G';
        top[9] = 'I';
      }),
    );
    expect(onBoard(board, 'locked').sort(byPosition)).toEqual([
      { col: 0, row: 0, color: T },
      { col: 1, row: 0, color: GARBAGE },
      { col: 9, row: 19, color: I },
    ]);
  });

  describe.each(Object.values(SKINS))('in the $name skin', (skin) => {
    const board = layoutBoard(
      game((state) => {
        const bottom = state.board[0];
        if (bottom) bottom[0] = 'G';
        state.hold = 'I';
      }),
      theme,
      skin,
      32,
      { ghost: true },
    );

    test('every filled cell is drawn with the skin’s canvas drawing, a cell wide', () => {
      for (const part of ['locked', 'active', 'hold', 'preview'] as const) {
        const shapes = cells(board, part);
        expect(shapes.length).toBeGreaterThan(0);
        for (const shape of shapes) {
          expect(shape.drawing).toBe(skin.canvas);
          expect(shape.size).toBe(32);
        }
      }
    });

    test('the ghost is drawn the same as in every other skin', () => {
      const ghosts = cells(board, 'ghost');
      expect(ghosts).toHaveLength(4);
      for (const shape of ghosts) expect(shape.drawing).toBe(GHOST_DRAWING);
    });
  });

  test('draws the active piece', () => {
    expect(onBoard(layout(game()), 'active').sort(byPosition)).toEqual([
      { col: 4, row: 9, color: T },
      { col: 5, row: 9, color: T },
      { col: 6, row: 9, color: T },
      { col: 5, row: 10, color: T },
    ]);
  });

  test('draws a piece in the two rows above the well, as it spawns', () => {
    const board = layout(
      game((state) => {
        state.active = { kind: 'T', col: 3, row: 21, rotation: 0 };
      }),
    );
    expect(
      onBoard(board, 'active')
        .map(({ row }) => row)
        .sort(),
    ).toEqual([20, 20, 20, 21]);
    for (const { y } of cells(board, 'active')) expect(y).toBeGreaterThanOrEqual(0);
  });

  test('with the ghost on, draws it where the piece would land, in the piece colour', () => {
    const board = layout(game(), { ghost: true });
    expect(onBoard(board, 'ghost').sort(byPosition)).toEqual([
      { col: 4, row: 0, color: T },
      { col: 5, row: 0, color: T },
      { col: 6, row: 0, color: T },
      { col: 5, row: 1, color: T },
    ]);
  });

  test('the ghost is every other pixel of the cell’s outer ring, at 55 % alpha', () => {
    const [ghost] = cells(layout(game()), 'ghost');
    const grid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => '.'));
    for (const { x, y, width, height, shade, alpha } of ghost?.drawing ?? []) {
      expect({ shade, alpha }).toEqual({ shade: 0, alpha: 0.55 });
      for (let row = y; row < y + height; row++) {
        for (let col = x; col < x + width; col++) {
          const line = grid[row];
          if (line) line[col] = '#';
        }
      }
    }
    expect(grid.map((line) => line.join(''))).toEqual([
      '#.#.#.##',
      '........',
      '#......#',
      '........',
      '#......#',
      '........',
      '#......#',
      '#.#.#.#.',
    ]);
  });

  test('with the ghost off, draws no ghost', () => {
    expect(cells(layout(game(), { ghost: false }), 'ghost')).toEqual([]);
  });

  test('draws no ghost once the game has ended', () => {
    const board = layout(
      game((state) => {
        state.toppedOut = true;
      }),
    );
    expect(cells(board, 'ghost')).toEqual([]);
  });

  test('draws the held piece in the hold, left of the well', () => {
    const board = layout(
      game((state) => {
        state.hold = 'I';
      }),
    );
    const { hold, well } = board.regions;
    const held = cells(board, 'hold');
    expect(held).toHaveLength(4);
    expect(hold.x + hold.width).toBeLessThan(well.x);
    for (const shape of held) {
      expect(shape.color).toEqual(I);
      expect(shape.size).toBe(32);
      expect(shape.x).toBeGreaterThanOrEqual(hold.x);
      expect(shape.x + shape.size).toBeLessThanOrEqual(hold.x + hold.width);
      expect(shape.y).toBeGreaterThanOrEqual(hold.y);
      expect(shape.y + shape.size).toBeLessThanOrEqual(hold.y + hold.height);
    }
    // I lies flat, centred.
    expect(new Set(held.map(({ y }) => y)).size).toBe(1);
    const left = Math.min(...held.map(({ x }) => x));
    expect(left - hold.x).toBe(hold.x + hold.width - (left + 4 * 32));
  });

  test('greys out the held piece once hold has been used', () => {
    const board = layout(
      game((state) => {
        state.hold = 'I';
        state.holdUsed = true;
      }),
    );
    for (const shape of cells(board, 'hold')) expect(shape.color).toEqual(GRID);
  });

  test('draws an empty hold with nothing in it', () => {
    expect(cells(layout(game()), 'hold')).toEqual([]);
  });

  test('draws the next 5 pieces in the preview, right of the well, nearest at the top', () => {
    const queue: PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    const board = layout(
      game((state) => {
        state.queue = queue;
      }),
    );
    const { preview, well } = board.regions;
    const next = cells(board, 'preview');
    expect(next).toHaveLength(20);
    expect(preview.x).toBeGreaterThan(well.x + well.width);
    for (const shape of next) {
      expect(shape.x).toBeGreaterThanOrEqual(preview.x);
      expect(shape.x + shape.size).toBeLessThanOrEqual(preview.x + preview.width);
      expect(shape.y).toBeGreaterThanOrEqual(preview.y);
      expect(shape.y + shape.size).toBeLessThanOrEqual(preview.y + preview.height);
    }
    const order = [...next].sort((a, b) => a.y - b.y).map(({ color }) => color);
    const colours = order.filter((color, at) => color !== order[at - 1]);
    expect(colours).toEqual([I, O, T, S, Z]);
  });

  test('every shape scales with the cell size', () => {
    const state = game((state) => {
      state.hold = 'L';
      const bottom = state.board[0];
      if (bottom) bottom[3] = 'G';
    });
    const small = layout(state, { cellSize: 16 });
    const big = layout(state, { cellSize: 40 });
    expect(big.width).toBe(small.width * 2.5);
    expect(big.height).toBe(small.height * 2.5);
    expect(big.shapes).toHaveLength(small.shapes.length);
    big.shapes.forEach((shape, at) => {
      const other = small.shapes[at];
      expect(shape.x).toBe((other?.x ?? NaN) * 2.5);
      expect(shape.y).toBe((other?.y ?? NaN) * 2.5);
      if (shape.type === 'cell' && other?.type === 'cell')
        expect(shape.size).toBe(other.size * 2.5);
      if (shape.type === 'rect' && other?.type === 'rect') {
        expect(shape.width).toBe(other.width * 2.5);
        expect(shape.height).toBe(other.height * 2.5);
      }
    });
  });

  test('puts every shape inside the layout', () => {
    const board = layout(
      game((state) => {
        state.hold = 'O';
      }),
    );
    for (const shape of board.shapes) {
      const width = shape.type === 'cell' ? shape.size : shape.width;
      const height = shape.type === 'cell' ? shape.size : shape.height;
      expect(shape.x).toBeGreaterThanOrEqual(0);
      expect(shape.y).toBeGreaterThanOrEqual(0);
      expect(shape.x + width).toBeLessThanOrEqual(board.width);
      expect(shape.y + height).toBeLessThanOrEqual(board.height);
    }
  });
});

/** A game whose garbage meter holds attacks of these lines, oldest first, ids 1, 2, 3… */
function attacked(...lines: number[]): EngineState {
  return game((state) => {
    state.garbageMeter = lines.map((count, at) => ({ id: at + 1, lines: count, holeSeed: 5 }));
  });
}

/** The meter's segments, bottom up: the rects drawn in a segment's main colour. */
function segments(board: { shapes: readonly BoardShape[] }, colors: readonly Rgb[] = [GARBAGE, Z]) {
  return board.shapes
    .filter((shape) => shape.type === 'rect' && shape.part === 'meter')
    .filter((shape) => colors.some((color) => color.join() === shape.color.join()))
    .sort((a, b) => b.y - a.y);
}

describe('layoutBoard: the garbage meter (design §13.2, Match)', () => {
  const meter = (state: EngineState, options: { flash?: number } = {}) =>
    layoutBoard(state, theme, skin, 32, { ghost: false, meter: true, ...options });

  test('is drawn only when asked for', () => {
    const board = layoutBoard(attacked(2), theme, skin, 32, { ghost: false });
    expect(board.shapes.some((shape) => shape.part === 'meter')).toBe(false);
  });

  test('is a bar left of the well, between it and the hold', () => {
    const board = meter(attacked());
    const { well, hold } = board.regions;
    const track = board.shapes.filter((shape) => shape.part === 'meter');
    expect(track.length).toBeGreaterThan(0);
    for (const shape of track) {
      expect(shape.type).toBe('rect');
      if (shape.type !== 'rect') continue;
      expect(shape.x + shape.width).toBeLessThan(well.x);
      expect(shape.x).toBeGreaterThan(hold.x + hold.width);
      expect(shape.y).toBeGreaterThanOrEqual(well.y);
      expect(shape.y + shape.height).toBeLessThanOrEqual(well.y + well.height);
    }
  });

  test('has one segment per attack, bottom up, a cell high per line, in the garbage colour', () => {
    const board = meter(attacked(2, 1, 4));
    const { well } = board.regions;
    const drawn = segments(board);
    expect(drawn.map((shape) => shape.color)).toEqual([GARBAGE, GARBAGE, GARBAGE]);
    // Each segment's colour sits inside its lines' cells, an art pixel in at the top and bottom.
    const bottom = well.y + well.height;
    expect(drawn.map((shape) => (shape.type === 'rect' ? [shape.y, shape.height] : []))).toEqual([
      [bottom - 2 * 32 + 4, 2 * 32 - 8],
      [bottom - 3 * 32 + 4, 32 - 8],
      [bottom - 7 * 32 + 4, 4 * 32 - 8],
    ]);
  });

  test('stops at the top of the well', () => {
    const board = meter(attacked(12, 12));
    const { well } = board.regions;
    const drawn = segments(board);
    expect(drawn).toHaveLength(2);
    expect(drawn[1]?.y).toBeGreaterThanOrEqual(well.y);
  });

  test('draws the attack being flashed in the flash colour, the others as usual', () => {
    const board = meter(attacked(2, 3), { flash: 2 });
    expect(segments(board).map((shape) => shape.color)).toEqual([GARBAGE, Z]);
  });

  test('is empty with nothing in the meter', () => {
    expect(segments(meter(attacked()))).toEqual([]);
  });
});

describe('layoutBoard: an out board', () => {
  test('greys every filled cell, the active piece, hold and preview included', () => {
    const board = layoutBoard(
      game((state) => {
        const bottom = state.board[0];
        if (bottom) bottom[0] = 'T';
        state.hold = 'I';
      }),
      theme,
      skin,
      32,
      { ghost: true, grey: true },
    );
    const colors = new Set(
      (['locked', 'active', 'hold', 'preview'] as const).flatMap((part) =>
        cells(board, part).map(({ color }) => color.join()),
      ),
    );
    expect(colors.size).toBe(1);
    expect([...colors][0]).not.toBe(T.join());
    expect(cells(board, 'ghost')).toEqual([]);
  });
});

describe('layoutSmallBoard: an FFA opponent’s board', () => {
  const small = (state: EngineState, options: { flash?: number; grey?: boolean } = {}) =>
    layoutSmallBoard(state, theme, skin, 16, options);

  test('is the well and its meter alone: no hold, preview or ghost', () => {
    const board = small(attacked(2));
    const parts = new Set(board.shapes.map((shape) => shape.part));
    expect(parts).toEqual(new Set(['frame', 'well', 'active', 'meter']));
    expect(board.width).toBe(SMALL_LAYOUT_CELLS.width * 16);
    expect(board.height).toBe(SMALL_LAYOUT_CELLS.height * 16);
    expect(segments(board)).toHaveLength(1);
  });

  test('draws its locked cells in the visible 20 rows', () => {
    const board = small(
      game((state) => {
        const bottom = state.board[0];
        if (bottom) bottom[3] = 'O';
      }),
    );
    const { well } = board.regions;
    const locked = board.shapes
      .filter((shape): shape is CellShape => shape.type === 'cell' && shape.part === 'locked')
      .map(({ x, y, color }) => ({ col: (x - well.x) / 16, row: 19 - (y - well.y) / 16, color }));
    expect(locked).toEqual([{ col: 3, row: 0, color: O }]);
  });

  test('puts every shape inside the layout, on whole art pixels', () => {
    const board = small(attacked(30));
    for (const shape of board.shapes) {
      const width = shape.type === 'rect' ? shape.width : shape.size;
      const height = shape.type === 'rect' ? shape.height : shape.size;
      expect(shape.x).toBeGreaterThanOrEqual(0);
      expect(shape.y).toBeGreaterThanOrEqual(0);
      expect(shape.x + width).toBeLessThanOrEqual(board.width);
      expect(shape.y + height).toBeLessThanOrEqual(board.height);
      expect(Number.isInteger(shape.x / 2)).toBe(true);
      expect(Number.isInteger(shape.y / 2)).toBe(true);
    }
  });
});

test('a rectangle as CSS places an element at it', () => {
  expect(rectStyle({ x: 10, y: 20, width: 30, height: 40 })).toEqual({
    left: 10,
    top: 20,
    width: 30,
    height: 40,
  });
});
