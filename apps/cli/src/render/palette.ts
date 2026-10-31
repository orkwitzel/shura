import { SHURA_DARK, SKINS, type Skin, type Theme } from '@shura/client-core';
import type { PieceKind } from '@shura/engine';

/**
 * How the CLI draws cells (design §13.3): the colours come from the theme and a filled cell's
 * characters from the skin, both client-core data (design §13.1). Only what has no setting lives
 * here.
 */

/**
 * How the terminal draws colour: 24-bit, the 16 ANSI colours, or none (`--no-color` / `NO_COLOR`),
 * which draws cells as glyphs instead, whatever the skin.
 */
export type ColorMode = 'truecolor' | 'ansi16' | 'none';

/** What fills a cell: a piece kind, or `G` for garbage. */
export type CellKind = PieceKind | 'G';

/** Everything that decides how a cell looks: the colour mode, the theme and the skin. */
export interface Look {
  readonly colors: ColorMode;
  readonly theme: Theme;
  readonly skin: Skin;
}

/** A look in `colors` with the default theme and skin. */
export function lookOf(colors: ColorMode): Look {
  return { colors, theme: SHURA_DARK, skin: SKINS.flat };
}

/** Cell strings other than a filled cell (the skin's), each 2 characters wide (design §13.3). */
export const CELLS = {
  /** Where the active piece would land, in its colour. */
  ghost: '░░',
  /** An empty cell of the visible board, in the theme's grid colour. */
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
