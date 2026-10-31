import type { Viewport } from './cell-size';
import { LAYOUT_CELLS, SMALL_LAYOUT_CELLS } from './layout-board';

/** The rows of cells above a board for its player's name: one for a full board, two for a small. */
export const NAME_ROWS = { full: 1, small: 2 } as const;

/**
 * The boxes of a match, in cells (design §13.2, Match): yours and a 1v1 opponent's are the full
 * layout (well, hold, preview) under a name row; an FFA opponent's small board is the well and its
 * meter under two name rows.
 */
export const MATCH_CELLS = {
  own: { width: LAYOUT_CELLS.width, height: LAYOUT_CELLS.height + NAME_ROWS.full },
  full: { width: LAYOUT_CELLS.width, height: LAYOUT_CELLS.height + NAME_ROWS.full },
  small: { width: SMALL_LAYOUT_CELLS.width, height: SMALL_LAYOUT_CELLS.height + NAME_ROWS.small },
} as const;

/** The space between your board and the opponents', in your cells. */
const GAP_CELLS = 1;

/** A skin's pixel art is 8 art pixels a side, so a cell is a multiple of 8 physical pixels. */
const ART_PIXELS = 8;

/** A board's box: its top-left corner (its name row's), in CSS pixels, on a whole physical pixel. */
export interface BoardSpot {
  readonly x: number;
  readonly y: number;
}

/** A cell size, in CSS pixels and in physical ones (a multiple of 8). */
export interface CellSize {
  readonly cellSize: number;
  readonly physicalCellSize: number;
}

/** Where a match's boards go in the window, and at what cell sizes. */
export interface MatchLayout {
  /** Your board, the full layout; `null` while you spectate, with no board of your own. */
  readonly own: (BoardSpot & CellSize) | null;
  readonly opponents: CellSize & {
    /**
     * A 1v1 opponent's board is the full layout, as are both boards of a 1v1 you spectate; the
     * other boards of an FFA are small.
     */
    readonly kind: 'full' | 'small';
    readonly columns: number;
    readonly rows: number;
    /** Each board's box, in order, row by row. */
    readonly spots: readonly BoardSpot[];
  };
}

export interface LayoutOptions {
  /** Whether you have a board of your own: `false` while you spectate. True by default. */
  readonly own?: boolean;
  /** CSS pixels kept clear across the top of the window, for a banner. */
  readonly top?: number;
}

/** The largest multiple of 8 physical pixels up to `fits`, at least 8. */
const cellOf = (fits: number) => Math.max(Math.floor(fits / ART_PIXELS), 1) * ART_PIXELS;

/**
 * Where a match's boards go (design §13.2, Match), with `count` opponents: your board on the left,
 * as large as fits the window's height (leaving room for the opponents at 8 px), and the opponents
 * in what's left on the right. One opponent (a 1v1) gets the full layout, at your cell size if the
 * window fits both, otherwise as large as fits. More get small boards in a grid whose column count
 * gives the largest cells, never larger than yours (a tie goes to more columns). Every cell size is
 * a multiple of 8 physical pixels and at least 8; the whole is centred in the window under `top`.
 *
 * Spectating (`own: false`; design §13.2, Spectating), `count` is every player: there is no board
 * of your own, and all of theirs share the window at the same size in such a grid, the full layout
 * for a 1v1's two and small boards for more.
 */
export function layoutOpponents(
  { width, height, pixelRatio }: Viewport,
  count: number,
  { own: hasOwn = true, top: clear = 0 }: LayoutOptions = {},
): MatchLayout {
  const W = width * pixelRatio;
  const reserved = Math.ceil(clear * pixelRatio);
  const H = Math.max(height * pixelRatio - reserved, 0);
  const kind = count === 1 || (!hasOwn && count === 2) ? 'full' : 'small';
  const box = MATCH_CELLS[kind];

  const leastOpponents = box.width * ART_PIXELS;
  const own = hasOwn
    ? cellOf(
        Math.min(
          H / MATCH_CELLS.own.height,
          (W - leastOpponents) / (MATCH_CELLS.own.width + GAP_CELLS),
        ),
      )
    : 0;
  const ownSpace = hasOwn ? (MATCH_CELLS.own.width + GAP_CELLS) * own : 0;
  const room = W - ownSpace;

  let best = { cell: 0, columns: 1, rows: count };
  for (let columns = 1; columns <= Math.max(count, 1); columns++) {
    const rows = Math.ceil(count / columns);
    const fits = cellOf(Math.min(room / (columns * box.width), H / (rows * box.height)));
    const cell = hasOwn ? Math.min(fits, own) : fits;
    if (cell >= best.cell) best = { cell, columns, rows };
  }
  const { cell, columns, rows } = best;

  const gridWidth = columns * box.width * cell;
  const gridHeight = rows * box.height * cell;
  const left = Math.max(Math.floor((W - ownSpace - gridWidth) / 2), 0);
  const top = (inner: number) => reserved + Math.max(Math.floor((H - inner) / 2), 0);
  const gridLeft = left + ownSpace;
  const gridTop = top(gridHeight);
  const css = (physical: number) => physical / pixelRatio;

  return {
    own: hasOwn
      ? {
          x: css(left),
          y: css(top(MATCH_CELLS.own.height * own)),
          cellSize: css(own),
          physicalCellSize: own,
        }
      : null,
    opponents: {
      kind,
      cellSize: css(cell),
      physicalCellSize: cell,
      columns,
      rows,
      spots: Array.from({ length: count }, (_, at) => ({
        x: css(gridLeft + (at % columns) * box.width * cell),
        y: css(gridTop + Math.floor(at / columns) * box.height * cell),
      })),
    },
  };
}
