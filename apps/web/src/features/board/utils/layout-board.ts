import {
  type CanvasDrawing,
  hasEnded,
  type Rgb,
  SKINS,
  type Skin,
  type Theme,
} from '@shura/client-core';
import {
  BOARD_WIDTH,
  type BoardCell,
  canMove,
  type PieceKind,
  pieceCells,
  type ReadonlyEngineState,
  srs,
  VISIBLE_ROWS,
} from '@shura/engine';

/** A rectangle, in the layout's pixels (CSS pixels), from its top-left corner. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What a shape is part of, so effects and tests can find it. */
export type BoardPart = 'frame' | 'well' | 'locked' | 'ghost' | 'active' | 'hold' | 'preview';

/** A plain filled rectangle. */
export interface RectShape extends Rect {
  readonly type: 'rect';
  readonly part: BoardPart;
  readonly color: Rgb;
}

/** A cell, drawn as pixel art (`lib/pixi/draw-cell`) in `color`. */
export interface CellShape {
  readonly type: 'cell';
  readonly part: BoardPart;
  readonly x: number;
  readonly y: number;
  /** The cell's width and height: 8 art pixels. */
  readonly size: number;
  readonly color: Rgb;
  readonly drawing: CanvasDrawing;
}

export type BoardShape = RectShape | CellShape;

/**
 * A board laid out at one cell size: the shapes to paint, in order, and where its parts are, for
 * what React draws over it (labels, the HUD, overlays).
 */
export interface BoardLayout {
  readonly width: number;
  readonly height: number;
  readonly regions: {
    /** The visible 20 rows. */
    readonly well: Rect;
    /** The held piece's box, left of the well. */
    readonly hold: Rect;
    /** The next 5 pieces' box, right of the well. */
    readonly preview: Rect;
    /** The free column under the hold, for the HUD. */
    readonly aside: Rect;
  };
  readonly shapes: readonly BoardShape[];
}

export interface LayoutOptions {
  /** Whether to draw the ghost (a setting). */
  readonly ghost: boolean;
}

/**
 * The ghost, in every skin: every other pixel of the cell's outer ring, in the piece colour at 55 %
 * alpha.
 */
export const GHOST_DRAWING: CanvasDrawing = [0, 2, 4, 6].flatMap((at) => [
  { x: at, y: 0, width: 1, height: 1, shade: 0, alpha: 0.55 },
  { x: at, y: 7, width: 1, height: 1, shade: 0, alpha: 0.55 },
  ...(at === 0 ? [] : [{ x: 0, y: at, width: 1, height: 1, shade: 0, alpha: 0.55 }]),
  { x: 7, y: at, width: 1, height: 1, shade: 0, alpha: 0.55 },
]);

/** The rows above the visible 20 that are drawn, so a piece that has just spawned is seen whole. */
export const HIDDEN_ROWS_SHOWN = 2;

/** How many pieces the preview shows. */
export const PREVIEW_PIECES = 5;

// The layout, in cells: half a cell of margin round everything, for the frames' borders and
// shadows; the hold's and preview's columns 5 cells wide (a piece's 4, and half a cell each side),
// a cell from the well; the 2 hidden rows above the well, where the boxes' labels go too.
const MARGIN = 0.5;
const SIDE = 5;
const GAP = 1;
const BOX_PAD = 0.5;
/** A piece's box in the hold and the preview: 4 cells wide, 2 tall, enough for any piece flat. */
const PIECE_BOX = { width: 4, height: 2 };
const WELL_LEFT = MARGIN + SIDE + GAP;
const PREVIEW_LEFT = WELL_LEFT + BOARD_WIDTH + GAP;

/** The whole layout's size in cells: the cell size scales it. */
export const LAYOUT_CELLS = {
  width: PREVIEW_LEFT + SIDE + MARGIN,
  height: HIDDEN_ROWS_SHOWN + VISIBLE_ROWS + MARGIN,
} as const;

/** The frames' border and the well's shadow, in art pixels (an eighth of a cell). */
const BORDER = 1;
const WELL_SHADOW = 2;
const BOX_SHADOW = 1;

/** How far the active piece can fall: where the ghost goes. */
function dropDistance(state: ReadonlyEngineState): number {
  let rows = 0;
  while (canMove(state, 0, -(rows + 1))) rows++;
  return rows;
}

/** Where a board's parts are at `cellSize`, which React needs to draw over it. */
export function boardRegions(cellSize: number): BoardLayout['regions'] {
  const c = cellSize;
  const well: Rect = {
    x: WELL_LEFT * c,
    y: HIDDEN_ROWS_SHOWN * c,
    width: BOARD_WIDTH * c,
    height: VISIBLE_ROWS * c,
  };
  const hold: Rect = {
    x: MARGIN * c,
    y: well.y,
    width: SIDE * c,
    height: (PIECE_BOX.height + 2 * BOX_PAD) * c,
  };
  const preview: Rect = {
    x: PREVIEW_LEFT * c,
    y: well.y,
    width: SIDE * c,
    height: (PREVIEW_PIECES * (PIECE_BOX.height + GAP) - GAP + 2 * BOX_PAD) * c,
  };
  const asideTop = hold.y + hold.height + GAP * c;
  const aside: Rect = {
    x: hold.x,
    y: asideTop,
    width: SIDE * c,
    height: well.y + well.height - asideTop,
  };
  return { well, hold, preview, aside };
}

/**
 * The shapes that draw a board (design §13.2, Boards): the checkered well, the locked cells
 * (garbage in the theme's garbage colour), the ghost when `ghost` is on, the active piece, the hold
 * on the left (greyed out once used) and the next 5 pieces on the right, each in a frame. Every
 * position is a whole number of art pixels (an eighth of `cellSize`), so a cell size of a multiple
 * of 8 physical pixels keeps the art sharp. A skin without a canvas drawing yet is drawn as Pixel.
 */
export function layoutBoard(
  state: ReadonlyEngineState,
  theme: Theme,
  skin: Skin,
  cellSize: number,
  { ghost }: LayoutOptions,
): BoardLayout {
  const c = cellSize;
  const art = c / 8;
  const drawing = skin.canvas ?? SKINS.pixel.canvas;
  const shapes: BoardShape[] = [];
  const regions = boardRegions(cellSize);
  const { well, hold, preview } = regions;

  const rect = (part: BoardPart, { x, y, width, height }: Rect, color: Rgb) =>
    shapes.push({ type: 'rect', part, x, y, width, height, color });
  /** A frame round `box`: a hard shadow, a border in the theme's border colour, then `fill`. */
  const frame = (box: Rect, shadow: number, fill?: Rgb) => {
    const border = BORDER * art;
    const outer = {
      x: box.x - border,
      y: box.y - border,
      width: box.width + 2 * border,
      height: box.height + 2 * border,
    };
    const offset = shadow * art;
    rect('frame', { ...outer, x: outer.x + offset, y: outer.y + offset }, theme.web.shadow);
    rect('frame', outer, theme.chrome.border.rgb);
    if (fill) rect('frame', box, fill);
  };
  const cell = (part: BoardPart, x: number, y: number, color: Rgb, art = drawing) =>
    shapes.push({ type: 'cell', part, x, y, size: c, color, drawing: art });
  /** A cell of the board at `col`, `row` (row 0 at the bottom). */
  const boardCell = (part: BoardPart, col: number, row: number, color: Rgb, art = drawing) =>
    cell(part, well.x + col * c, well.y + (VISIBLE_ROWS - 1 - row) * c, color, art);
  const colorOf = (kind: Exclude<BoardCell, null>): Rgb =>
    kind === 'G' ? theme.garbage.rgb : theme.pieces[kind].rgb;
  /** A piece in its spawn rotation, centred in the 4×2 box whose top-left is `x`, `y`. */
  const smallPiece = (part: BoardPart, kind: PieceKind, x: number, y: number, color: Rgb) => {
    const offsets = srs.cellOffsets(kind, 0);
    const cols = offsets.map(([col]) => col);
    const rows = offsets.map(([, row]) => row);
    const left = Math.min(...cols);
    const top = Math.max(...rows);
    const width = Math.max(...cols) - left + 1;
    const height = top - Math.min(...rows) + 1;
    const dx = x + ((PIECE_BOX.width - width) / 2) * c;
    const dy = y + ((PIECE_BOX.height - height) / 2) * c;
    for (const [col, row] of offsets)
      cell(part, dx + (col - left) * c, dy + (top - row) * c, color);
  };

  // The well: its frame, then a checker of the theme's two well colours.
  frame(well, WELL_SHADOW);
  const [wellA, wellB] = theme.web.well;
  for (let row = 0; row < VISIBLE_ROWS; row++) {
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const x = well.x + col * c;
      const y = well.y + row * c;
      rect('well', { x, y, width: c, height: c }, (col + row) % 2 === 0 ? wellA : wellB);
    }
  }

  // The locked cells, the hidden rows shown included.
  for (let row = 0; row < VISIBLE_ROWS + HIDDEN_ROWS_SHOWN; row++) {
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const kind = state.board[row]?.[col] ?? null;
      if (kind !== null) boardCell('locked', col, row, colorOf(kind));
    }
  }

  // The ghost, then the active piece. A game that has ended leaves the piece that locked (already
  // drawn as locked cells) or the one that couldn't spawn as the active piece: it has no ghost.
  const { active } = state;
  const activeColor = theme.pieces[active.kind].rgb;
  if (ghost && !hasEnded(state)) {
    const fall = dropDistance(state);
    for (const { col, row } of pieceCells(active)) {
      boardCell('ghost', col, row - fall, activeColor, GHOST_DRAWING);
    }
  }
  for (const { col, row } of pieceCells(active)) {
    if (row < VISIBLE_ROWS + HIDDEN_ROWS_SHOWN) boardCell('active', col, row, activeColor);
  }

  // The hold, greyed out once used for this piece.
  frame(hold, BOX_SHADOW, theme.web.deep);
  if (state.hold !== null) {
    const color = state.holdUsed ? theme.chrome.grid.rgb : theme.pieces[state.hold].rgb;
    smallPiece('hold', state.hold, hold.x + BOX_PAD * c, hold.y + BOX_PAD * c, color);
  }

  // The preview: the next 5 pieces, nearest at the top.
  frame(preview, BOX_SHADOW, theme.web.deep);
  state.queue.slice(0, PREVIEW_PIECES).forEach((kind, at) => {
    const y = preview.y + (BOX_PAD + at * (PIECE_BOX.height + GAP)) * c;
    smallPiece('preview', kind, preview.x + BOX_PAD * c, y, theme.pieces[kind].rgb);
  });

  return {
    width: LAYOUT_CELLS.width * c,
    height: LAYOUT_CELLS.height * c,
    regions,
    shapes,
  };
}
