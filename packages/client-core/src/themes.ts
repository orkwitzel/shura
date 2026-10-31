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

/** The piece colours, which every theme shares: the themes differ in their backdrop. */
const PIECES = {
  I: { rgb: [62, 224, 255], ansi16: 14 },
  O: { rgb: [255, 210, 63], ansi16: 11 },
  T: { rgb: [200, 107, 250], ansi16: 13 },
  S: { rgb: [92, 242, 122], ansi16: 10 },
  Z: { rgb: [255, 77, 109], ansi16: 9 },
  J: { rgb: [77, 124, 255], ansi16: 12 },
  // Many terminal colour schemes draw yellow (3) as orange.
  L: { rgb: [255, 154, 60], ansi16: 3 },
} as const satisfies Theme['pieces'];

/** The cream text and borders and the gold accent, which every theme shares. */
const CREAM = { rgb: [255, 244, 220], ansi16: 15 } as const satisfies ThemeColor;
const GOLD = { rgb: [255, 210, 63], ansi16: 11 } as const satisfies ThemeColor;

/** Indigo, the default theme: a deep violet backdrop. */
const INDIGO = {
  id: 'indigo',
  name: 'Indigo',
  pieces: PIECES,
  ghost: { rgb: [106, 90, 156], ansi16: 8 },
  garbage: { rgb: [138, 128, 168], ansi16: 8 },
  chrome: {
    background: { rgb: [27, 15, 54], ansi16: 0 },
    text: CREAM,
    border: CREAM,
    accent: GOLD,
    board: { rgb: [23, 12, 46], ansi16: 0 },
    grid: { rgb: [58, 42, 99], ansi16: 8 },
  },
} as const satisfies Theme;

/** Plum: a deep purple-red backdrop. */
const PLUM = {
  id: 'plum',
  name: 'Plum',
  pieces: PIECES,
  ghost: { rgb: [138, 90, 136], ansi16: 8 },
  garbage: { rgb: [160, 128, 152], ansi16: 8 },
  chrome: {
    background: { rgb: [42, 11, 42], ansi16: 0 },
    text: CREAM,
    border: CREAM,
    accent: GOLD,
    board: { rgb: [29, 8, 28], ansi16: 0 },
    grid: { rgb: [77, 35, 80], ansi16: 8 },
  },
} as const satisfies Theme;

/** Deep Sea: a deep blue backdrop. */
const DEEP_SEA = {
  id: 'deep-sea',
  name: 'Deep Sea',
  pieces: PIECES,
  ghost: { rgb: [79, 111, 148], ansi16: 8 },
  garbage: { rgb: [127, 147, 168], ansi16: 8 },
  chrome: {
    background: { rgb: [7, 26, 46], ansi16: 0 },
    text: CREAM,
    border: CREAM,
    accent: GOLD,
    board: { rgb: [7, 24, 39], ansi16: 0 },
    grid: { rgb: [30, 61, 92], ansi16: 8 },
  },
} as const satisfies Theme;

/** Every theme, by id, the default first. More themes are new entries here, with no code changes. */
export const THEMES = {
  [INDIGO.id]: INDIGO,
  [PLUM.id]: PLUM,
  [DEEP_SEA.id]: DEEP_SEA,
} as const satisfies Record<string, Theme>;

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

/** Every skin, by id, the default first. */
export const SKINS = {
  pixel: { id: 'pixel', name: 'Pixel', terminal: '██' },
  flat: { id: 'flat', name: 'Flat', terminal: '▓▓' },
  outline: { id: 'outline', name: 'Outline', terminal: '[]' },
} as const satisfies Record<string, Skin>;

export type SkinId = keyof typeof SKINS;
