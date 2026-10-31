import { LAYOUT_CELLS } from './layout-board';

/** The window, in CSS pixels, and its device pixel ratio. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

/** Where the board goes in the window, and at what cell size. */
export interface BoardFit {
  /** The cell size in CSS pixels, which `layoutBoard` takes. */
  readonly cellSize: number;
  /** The cell size in physical pixels: a multiple of 8, so each art pixel is whole pixels. */
  readonly physicalCellSize: number;
  /** The layout's top-left corner, in CSS pixels, on a whole physical pixel. */
  readonly x: number;
  readonly y: number;
}

/** A skin's pixel art is 8 art pixels a side. */
const ART_PIXELS = 8;

/**
 * The cell size and place of the board (design §13.2, Boards): the largest multiple of 8 physical
 * pixels at which the board, hold and preview fit the window (its height, on a desktop), at least
 * 8, and centred in it, the rest being margin. Work it out again when the window or its pixel ratio
 * changes.
 */
export function fitBoard({ width, height, pixelRatio }: Viewport): BoardFit {
  const physicalWidth = width * pixelRatio;
  const physicalHeight = height * pixelRatio;
  const fits = Math.min(physicalWidth / LAYOUT_CELLS.width, physicalHeight / LAYOUT_CELLS.height);
  const physicalCellSize = Math.max(Math.floor(fits / ART_PIXELS), 1) * ART_PIXELS;
  const centre = (window: number, cells: number) =>
    Math.max(Math.floor((window - cells * physicalCellSize) / 2), 0) / pixelRatio;
  return {
    cellSize: physicalCellSize / pixelRatio,
    physicalCellSize,
    x: centre(physicalWidth, LAYOUT_CELLS.width),
    y: centre(physicalHeight, LAYOUT_CELLS.height),
  };
}
