import type { PieceKind } from '@shura/engine';

/**
 * One of the 16 ANSI colours, by its index: 0–7 the normal colours (black, red, green, yellow,
 * blue, magenta, cyan, white), 8–15 their bright versions.
 */
export type Ansi16 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

/** A 24-bit colour: red, green and blue, each 0–255. */
export type Rgb = readonly [red: number, green: number, blue: number];

/** A theme colour: its 24-bit value, and the nearest ANSI colour for terminals without 24-bit. */
export interface ThemeColor {
  readonly rgb: Rgb;
  readonly ansi16: Ansi16;
}

/** A see-through colour: its 24-bit value and its alpha, 0 (clear) to 1 (opaque). */
export interface TranslucentColor {
  readonly rgb: Rgb;
  readonly alpha: number;
}

/**
 * The colours only the web needs (design §13.2, Styling), which the CLI ignores: the panels, the
 * shadow, the muted text, the backdrop's three swirls and the board's checkered well.
 */
export interface WebColors {
  /** Panels and cards. */
  readonly panel: Rgb;
  /** The darkest panels: boxes inside a panel, such as the hold and the preview. */
  readonly deep: Rgb;
  /** The hard offset shadows and dark outlines (ink). */
  readonly shadow: Rgb;
  /** Secondary text: hints, taglines and details beside a label. */
  readonly muted: Rgb;
  /** The backdrop's three drifting colour swirls. */
  readonly swirls: readonly [TranslucentColor, TranslucentColor, TranslucentColor];
  /** The board well's two checker colours. */
  readonly well: readonly [Rgb, Rgb];
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
  readonly web: WebColors;
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

/** The web's shadow (ink) and muted text, which every theme shares. */
const INK = [10, 4, 20] as const satisfies Rgb;
const MUTED = [201, 191, 224] as const satisfies Rgb;

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
  web: {
    panel: [42, 26, 77],
    deep: [18, 8, 38],
    shadow: INK,
    muted: MUTED,
    swirls: [
      { rgb: [255, 77, 109], alpha: 0.45 },
      { rgb: [77, 124, 255], alpha: 0.5 },
      { rgb: [255, 210, 63], alpha: 0.25 },
    ],
    well: [
      [23, 12, 46],
      [28, 16, 56],
    ],
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
  web: {
    panel: [61, 22, 64],
    deep: [26, 6, 25],
    shadow: INK,
    muted: MUTED,
    swirls: [
      { rgb: [255, 120, 60], alpha: 0.42 },
      { rgb: [255, 77, 170], alpha: 0.42 },
      { rgb: [120, 90, 255], alpha: 0.32 },
    ],
    well: [
      [29, 8, 28],
      [37, 11, 36],
    ],
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
  web: {
    panel: [16, 48, 77],
    deep: [6, 20, 35],
    shadow: INK,
    muted: MUTED,
    swirls: [
      { rgb: [62, 224, 255], alpha: 0.32 },
      { rgb: [77, 124, 255], alpha: 0.45 },
      { rgb: [255, 77, 109], alpha: 0.3 },
    ],
    well: [
      [7, 24, 39],
      [10, 30, 49],
    ],
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
 * A rectangle of a cell's pixel art, on its 8×8 grid of art pixels: (0, 0) is the top-left art
 * pixel, and `x` grows right, `y` down.
 */
export interface ArtRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /**
   * Its colour, from the cell's: 0 is the cell's colour, a negative shade darkens it toward black
   * (-0.55 is 55 % of the way) and a positive one lightens it toward white (1 is white).
   */
  readonly shade: number;
  /** Its opacity, 0 (clear) to 1 (opaque, without one). */
  readonly alpha?: number;
}

/** How a skin draws a cell on a canvas: rectangles of pixel art, painted in order. */
export type CanvasDrawing = readonly ArtRect[];

/** How a cell is drawn, separately from its colour (design §13.1, Themes and skins). */
export interface Skin {
  readonly id: string;
  readonly name: string;
  /** A filled cell in a terminal: two characters, drawn in the cell's colour. */
  readonly terminal: string;
  /**
   * A filled cell on a canvas, as pixel art. Only Pixel has one so far: the web draws the others
   * as Pixel until theirs come (#49).
   */
  readonly canvas?: CanvasDrawing;
}

/**
 * The Pixel skin's canvas drawing (design §13.1): the edge (the whole cell, darkened 55 %), the
 * inner 6×6 in the piece colour, its top row and left column lightened 40 %, its bottom row and
 * its right column from row 2 down darkened 22 %, and one white shine pixel at (2, 2).
 */
const PIXEL_CANVAS: CanvasDrawing = [
  { x: 0, y: 0, width: 8, height: 8, shade: -0.55 },
  { x: 1, y: 1, width: 6, height: 6, shade: 0 },
  { x: 1, y: 1, width: 6, height: 1, shade: 0.4 },
  { x: 1, y: 1, width: 1, height: 6, shade: 0.4 },
  { x: 1, y: 6, width: 6, height: 1, shade: -0.22 },
  { x: 6, y: 2, width: 1, height: 5, shade: -0.22 },
  { x: 2, y: 2, width: 1, height: 1, shade: 1 },
];

/** Every skin, by id, the default first. */
export const SKINS = {
  pixel: { id: 'pixel', name: 'Pixel', terminal: '██', canvas: PIXEL_CANVAS },
  flat: { id: 'flat', name: 'Flat', terminal: '▓▓' },
  outline: { id: 'outline', name: 'Outline', terminal: '[]' },
} as const satisfies Record<string, Skin>;

export type SkinId = keyof typeof SKINS;
