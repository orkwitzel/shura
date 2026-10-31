import type { PieceKind } from '@shura/engine';

/**
 * Every colour and cell string the CLI draws boards with (design §13.3), in one place so a theme or
 * skin can replace them.
 */

/**
 * How the terminal draws colour: 24-bit, the 16 ANSI colours, or none (`--no-color` / `NO_COLOR`),
 * which draws cells as glyphs instead.
 */
export type ColorMode = 'truecolor' | 'ansi16' | 'none';

/** What fills a cell: a piece kind, or `G` for garbage. */
export type CellKind = PieceKind | 'G';

/** 24-bit colours, as [red, green, blue]. */
export const RGB: Readonly<Record<CellKind, readonly [number, number, number]>> = {
  I: [49, 199, 239],
  O: [247, 211, 8],
  T: [173, 77, 156],
  S: [66, 182, 66],
  Z: [239, 32, 41],
  J: [90, 101, 173],
  L: [239, 121, 33],
  G: [128, 128, 128],
};

/** The 16-colour fallbacks, as SGR foreground codes. Many palettes draw 33 as orange. */
export const ANSI16: Readonly<Record<CellKind, number>> = {
  I: 36,
  O: 93,
  T: 35,
  S: 32,
  Z: 31,
  J: 34,
  L: 33,
  G: 90,
};

/** The colour of an empty cell's dot and of anything greyed out (a hold already used). */
export const FAINT = { rgb: [72, 72, 72] as const, ansi16: 90 };

/** Cell strings, each 2 characters wide (one cell is 2 columns, design §13.3). */
export const CELLS = {
  /** A locked cell or the active piece's, drawn in its colour. */
  solid: '██',
  /** Where the active piece would land, in its colour. */
  ghost: '░░',
  /** An empty cell of the visible board, in the faint colour. */
  empty: ' .',
  /** An empty cell above the visible board, or beside a small piece. */
  blank: '  ',
};

/** Cell strings without colour, so every kind of cell still reads differently. */
export const GLYPHS: Readonly<Record<'solid' | 'garbage' | 'ghost' | 'empty' | 'blank', string>> = {
  solid: '[]',
  garbage: '##',
  ghost: '::',
  empty: ' .',
  blank: '  ',
};

/** The well's walls and floor. */
export const WALLS = { side: '│', floor: '─', left: '└', right: '┘' };
