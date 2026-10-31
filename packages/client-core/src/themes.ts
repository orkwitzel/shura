import type { PieceKind } from '@shura/engine';

/**
 * One of the 16 ANSI colours, by its index: 0–7 the normal colours (black, red, green, yellow,
 * blue, magenta, cyan, white), 8–15 their bright versions.
 */
export type Ansi16 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

/** A theme colour: its 24-bit value, and the nearest ANSI colour for terminals without 24-bit. */
export interface ThemeColor {
  readonly rgb: readonly [red: number, green: number, blue: number];
  readonly ansi16: Ansi16;
}

/**
 * A designed set of colours (design §13.1, Themes and skins): the seven piece colours, ghost and
 * garbage, and the UI chrome, designed against the theme's own background.
 */
export interface Theme {
  readonly id: string;
  readonly name: string;
  readonly pieces: Readonly<Record<PieceKind, ThemeColor>>;
  readonly ghost: ThemeColor;
  readonly garbage: ThemeColor;
  readonly chrome: {
    readonly background: ThemeColor;
    readonly text: ThemeColor;
    readonly border: ThemeColor;
    readonly accent: ThemeColor;
    /** The board's background, behind its empty cells. */
    readonly board: ThemeColor;
    /** The board's grid: the CLI's empty-cell dots, and anything greyed out. */
    readonly grid: ThemeColor;
  };
}

/**
 * Shura Dark, the one v1 theme. The values are placeholders until the theme is designed (M3):
 * guideline hues on a near-black background.
 */
export const SHURA_DARK = {
  id: 'shura-dark',
  name: 'Shura Dark',
  pieces: {
    I: { rgb: [49, 199, 239], ansi16: 6 },
    O: { rgb: [247, 211, 8], ansi16: 11 },
    T: { rgb: [173, 77, 156], ansi16: 5 },
    S: { rgb: [66, 182, 66], ansi16: 2 },
    Z: { rgb: [239, 32, 41], ansi16: 1 },
    J: { rgb: [90, 101, 173], ansi16: 4 },
    // Many terminal colour schemes draw yellow (3) as orange.
    L: { rgb: [239, 121, 33], ansi16: 3 },
  },
  ghost: { rgb: [96, 100, 112], ansi16: 8 },
  garbage: { rgb: [128, 128, 128], ansi16: 8 },
  chrome: {
    background: { rgb: [16, 17, 22], ansi16: 0 },
    text: { rgb: [220, 222, 228], ansi16: 7 },
    border: { rgb: [70, 74, 86], ansi16: 8 },
    accent: { rgb: [49, 199, 239], ansi16: 14 },
    board: { rgb: [10, 11, 15], ansi16: 0 },
    grid: { rgb: [72, 72, 72], ansi16: 8 },
  },
} as const satisfies Theme;

/** Every theme, by id. More themes are new entries here, with no code changes. */
export const THEMES = { [SHURA_DARK.id]: SHURA_DARK } as const satisfies Record<string, Theme>;

export type ThemeId = keyof typeof THEMES;

/**
 * How a cell is drawn, separately from its colour (design §13.1, Themes and skins). The canvas
 * drawing joins the terminal one in M3.
 */
export interface Skin {
  readonly id: string;
  readonly name: string;
  /** A filled cell in a terminal: two characters, drawn in the cell's colour. */
  readonly terminal: string;
}

/** Every skin, by id. */
export const SKINS = {
  flat: { id: 'flat', name: 'Flat', terminal: '██' },
  outlined: { id: 'outlined', name: 'Outlined', terminal: '[]' },
  bevelled: { id: 'bevelled', name: 'Bevelled', terminal: '▓▓' },
} as const satisfies Record<string, Skin>;

export type SkinId = keyof typeof SKINS;
