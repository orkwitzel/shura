import {
  type CanvasDrawing,
  hasEnded,
  type Rgb,
  type Skin,
  type Theme,
  totalLines,
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
import { shade } from '@/utils/color';

/** A rectangle, in the layout's pixels (CSS pixels), from its top-left corner. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What a shape is part of, so effects and tests can find it. */
export type BoardPart =
  | 'frame'
  | 'well'
  | 'locked'
  | 'ghost'
  | 'active'
  | 'hold'
  | 'preview'
  | 'meter';

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
  /** Whether to draw the garbage meter, left of the well: online only. */
  readonly meter?: boolean;
  /** The id of the meter's attack to draw in the flash colour, as it flashes on arriving. */
  readonly flash?: number | undefined;
  /** Whether the game is out (design §13.2, Match): every filled cell grey, and no ghost. */
  readonly grey?: boolean;
}

/** What a small board takes: no ghost, and always its meter. */
export type SmallLayoutOptions = Pick<LayoutOptions, 'flash' | 'grey'>;

/** A small board laid out: an FFA opponent's well and meter (design §13.2, Match). */
export interface SmallBoardLayout {
  readonly width: number;
  readonly height: number;
  readonly regions: { readonly well: Rect };
  readonly shapes: readonly BoardShape[];
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

/**
 * A small board's layout, in cells: half a cell of margin round it, and a cell left of the well for
 * the meter.
 */
const SMALL_WELL_LEFT = MARGIN + 1;
export const SMALL_LAYOUT_CELLS = {
  width: SMALL_WELL_LEFT + BOARD_WIDTH + MARGIN,
  height: MARGIN + VISIBLE_ROWS + MARGIN,
} as const;

/** The frames' border and the well's shadow, in art pixels (an eighth of a cell). */
const BORDER = 1;
const WELL_SHADOW = 2;
const BOX_SHADOW = 1;

/**
 * The meter's width in art pixels: half a cell, an art pixel clear of the well's border. On a full
 * board it fills the gap from the hold's shadow.
 */
const METER_WIDTH = 4;
/** How far a segment's colour sits inside its lines' cells, at the top and the bottom. */
const SEGMENT_INSET = 1;

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
 * The garbage meter's bar beside `well` at `cellSize`, an art pixel clear of the well's border.
 */
export function meterBar(well: Rect, cellSize: number): Rect {
  const art = cellSize / 8;
  return {
    x: well.x - (BORDER + 1 + METER_WIDTH) * art,
    y: well.y,
    width: METER_WIDTH * art,
    height: well.height,
  };
}

/**
 * Where an attack streak to a board lands (design §13.2, Match): the top of its garbage meter's
 * segments, in the middle of the bar, in the board's layout pixels.
 */
export function meterTop(
  well: Rect,
  cellSize: number,
  meter: ReadonlyEngineState['garbageMeter'],
): { readonly x: number; readonly y: number } {
  const bar = meterBar(well, cellSize);
  const lines = totalLines(meter);
  return {
    x: bar.x + bar.width / 2,
    y: Math.max(well.y + well.height - lines * cellSize, well.y),
  };
}

/** Draws shapes at one cell size, in one theme and skin, a game out or not. */
function shapesFor(theme: Theme, skin: Skin, cellSize: number, grey: boolean) {
  const c = cellSize;
  const art = c / 8;
  const shapes: BoardShape[] = [];
  /** Out boards draw every filled cell in one grey, as a top-out's fade does. */
  const greyed = shade(theme.web.muted, -0.55);
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
  const cell = (part: BoardPart, x: number, y: number, color: Rgb, drawing = skin.canvas) =>
    shapes.push({ type: 'cell', part, x, y, size: c, color: grey ? greyed : color, drawing });
  const colorOf = (kind: Exclude<BoardCell, null>): Rgb =>
    kind === 'G' ? theme.garbage.rgb : theme.pieces[kind].rgb;

  /** The well: its frame, then a checker of the theme's two well colours. */
  const wellOf = (well: Rect) => {
    frame(well, WELL_SHADOW);
    const [wellA, wellB] = theme.web.well;
    for (let row = 0; row < VISIBLE_ROWS; row++) {
      for (let col = 0; col < BOARD_WIDTH; col++) {
        const x = well.x + col * c;
        const y = well.y + row * c;
        rect('well', { x, y, width: c, height: c }, (col + row) % 2 === 0 ? wellA : wellB);
      }
    }
  };

  /**
   * The game in `well`: its locked cells and active piece in the bottom `rows` rows (the hidden
   * rows shown included, or not), and the ghost if `ghost`.
   */
  const gameIn = (well: Rect, state: ReadonlyEngineState, rows: number, ghost: boolean) => {
    /** A cell of the board at `col`, `row` (row 0 at the bottom). */
    const boardCell = (
      part: BoardPart,
      col: number,
      row: number,
      color: Rgb,
      drawing?: CanvasDrawing,
    ) => cell(part, well.x + col * c, well.y + (VISIBLE_ROWS - 1 - row) * c, color, drawing);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < BOARD_WIDTH; col++) {
        const kind = state.board[row]?.[col] ?? null;
        if (kind !== null) boardCell('locked', col, row, colorOf(kind));
      }
    }
    // The ghost, then the active piece. A game that has ended leaves the piece that locked (already
    // drawn as locked cells) or the one that couldn't spawn as the active piece: it has no ghost.
    const { active } = state;
    const activeColor = theme.pieces[active.kind].rgb;
    if (ghost && !grey && !hasEnded(state)) {
      const fall = dropDistance(state);
      for (const { col, row } of pieceCells(active)) {
        boardCell('ghost', col, row - fall, activeColor, GHOST_DRAWING);
      }
    }
    for (const { col, row } of pieceCells(active)) {
      if (row < rows) boardCell('active', col, row, activeColor);
    }
  };

  /**
   * The garbage meter (design §13.2, Match), half a cell wide, an art pixel left of `well`'s
   * border: a dark track, then one segment per attack in the meter, bottom up, a cell high per line
   * and stopping at the top of the well, in the garbage colour (the one flashing in the flash
   * colour), each a darker edge round its colour.
   */
  const meterOf = (
    well: Rect,
    meter: ReadonlyEngineState['garbageMeter'],
    flash: number | undefined,
  ) => {
    const bar = meterBar(well, c);
    const { x } = bar;
    const width = METER_WIDTH;
    rect('meter', bar, theme.web.shadow);
    let bottom = well.y + well.height;
    for (const { id, lines } of meter) {
      const top = Math.max(bottom - lines * c, well.y);
      if (top >= bottom) break;
      const color = id === flash ? theme.pieces.Z.rgb : theme.garbage.rgb;
      const height = bottom - top;
      rect('meter', { x, y: top, width: width * art, height }, shade(color, -0.45));
      const inset = SEGMENT_INSET * art;
      rect(
        'meter',
        { x, y: top + inset, width: (width - 1) * art, height: height - 2 * inset },
        color,
      );
      bottom = top;
    }
  };

  return { shapes, frame, cell, wellOf, gameIn, meterOf };
}

/**
 * The shapes that draw a board (design §13.2, Boards): the checkered well, the locked cells
 * (garbage in the theme's garbage colour), the ghost when `ghost` is on, the active piece, the hold
 * on the left (greyed out once used) and the next 5 pieces on the right, each in a frame. Every
 * position is a whole number of art pixels (an eighth of `cellSize`), so a cell size of a multiple
 * of 8 physical pixels keeps the art sharp. Filled cells are drawn in `skin`'s canvas drawing, and
 * the ghost the same in every skin.
 *
 * Online (design §13.2, Match), `meter` draws the garbage meter left of the well, `flash` names the
 * attack in it drawn flashing, and `grey` draws an out game's every filled cell grey.
 */
export function layoutBoard(
  state: ReadonlyEngineState,
  theme: Theme,
  skin: Skin,
  cellSize: number,
  { ghost, meter = false, flash, grey = false }: LayoutOptions,
): BoardLayout {
  const c = cellSize;
  const draw = shapesFor(theme, skin, cellSize, grey);
  const { frame, cell } = draw;
  const regions = boardRegions(cellSize);
  const { well, hold, preview } = regions;

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

  draw.wellOf(well);
  // The locked cells and the active piece, the hidden rows shown included.
  draw.gameIn(well, state, VISIBLE_ROWS + HIDDEN_ROWS_SHOWN, ghost);
  if (meter) draw.meterOf(well, state.garbageMeter, flash);

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
    shapes: draw.shapes,
  };
}

/** Where a small board's well is at `cellSize`. */
export function smallBoardWell(cellSize: number): Rect {
  return {
    x: SMALL_WELL_LEFT * cellSize,
    y: MARGIN * cellSize,
    width: BOARD_WIDTH * cellSize,
    height: VISIBLE_ROWS * cellSize,
  };
}

/**
 * A small board (design §13.2, Match: an FFA opponent's): the checkered well with the locked cells
 * and the active piece in its visible 20 rows, and the garbage meter left of it. No hold, preview or
 * ghost. `flash` and `grey` as for `layoutBoard`.
 */
export function layoutSmallBoard(
  state: ReadonlyEngineState,
  theme: Theme,
  skin: Skin,
  cellSize: number,
  { flash, grey = false }: SmallLayoutOptions,
): SmallBoardLayout {
  const draw = shapesFor(theme, skin, cellSize, grey);
  const well = smallBoardWell(cellSize);
  draw.wellOf(well);
  draw.gameIn(well, state, VISIBLE_ROWS, false);
  draw.meterOf(well, state.garbageMeter, flash);
  return {
    width: SMALL_LAYOUT_CELLS.width * cellSize,
    height: SMALL_LAYOUT_CELLS.height * cellSize,
    regions: { well },
    shapes: draw.shapes,
  };
}
