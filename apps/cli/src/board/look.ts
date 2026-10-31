import { SKINS, type Skin, THEMES, type Theme } from '@shura/client-core';
import type { BoardCell } from '@shura/engine';
import type { ColorMode } from '../platform/terminal/color-mode';

/**
 * How the CLI draws cells (design §13.3): the colours come from the theme and a filled cell's
 * characters from the skin, both client-core data (design §13.1). Only what has no setting lives
 * here.
 */

/** What fills a cell: a piece kind, or garbage. */
export type CellKind = NonNullable<BoardCell>;

/** Everything that decides how a cell looks: the colour mode, the theme and the skin. */
export interface Look {
  readonly colors: ColorMode;
  readonly theme: Theme;
  readonly skin: Skin;
}

/** A look in `colors` with the default theme and skin. */
export function lookOf(colors: ColorMode): Look {
  return { colors, theme: THEMES.indigo, skin: SKINS.pixel };
}

/** Cell strings other than a filled cell (the skin's), each 2 characters wide (design §13.3). */
export const CELLS = {
  /** Where the active piece would land, in the theme's ghost colour. */
  ghost: '░░',
  /** An empty cell of the visible board, in the theme's grid colour. */
  empty: ' .',
  /** An empty cell above the visible board, or beside a small piece. */
  blank: '  ',
};

/**
 * Cell strings without colour, so every kind of cell still reads differently. Empty cells and
 * blanks read differently already.
 */
export const GLYPHS: Readonly<Record<'solid' | 'garbage' | 'ghost' | 'empty' | 'blank', string>> = {
  solid: '[]',
  garbage: '##',
  ghost: '::',
  empty: CELLS.empty,
  blank: CELLS.blank,
};

/** The board's walls and floor. */
export const WALLS = { side: '│', floor: '─', left: '└', right: '┘' };
