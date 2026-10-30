/** Gravity counts in sub-rows: 60 × 2^16 per row, so any whole number of rows per second is exact. */
export const SUBROWS_PER_ROW = 3_932_160;

/** Gravity of 1 row per second, in sub-rows per frame. */
const ONE_ROW_PER_SECOND = 65_536;

/** Frames a piece can rest on the stack before it locks (design §3). */
export const LOCK_DELAY = 30;
/** How many times moving or rotating on the stack can restart one piece's lock delay (design §3). */
export const MAX_LOCK_RESETS = 15;
/** How many next pieces the queue shows (design §3). */
export const PREVIEW_SIZE = 5;

/**
 * The rule values a mode fixes (design §3, §4), all whole numbers. A game ends at a top-out, or
 * when it meets the mode's line goal or frame limit.
 */
export interface ModeSettings {
  /**
   * Sub-rows the active piece falls per frame at each level, from level 1. Its length is the level
   * cap: the level rises no further, and levels above it fall at the last gravity.
   */
  gravity: readonly number[];
  /** Lines to clear for each new level: the level is 1 + one per `linesPerLevel` lines, to the cap. */
  linesPerLevel: number;
  /** Lines cleared that end the game, on the lock that reaches them, or `null` for no line goal. */
  lineGoal: number | null;
  /** The frame the game ends at, after its actions and gravity, or `null` for no time limit. */
  frameLimit: number | null;
  /** Frames a piece can rest on the stack before it locks. */
  lockDelay: number;
  /** How many times moving or rotating on the stack can restart one piece's lock delay. */
  maxLockResets: number;
  /** How many next pieces the queue shows. */
  previewSize: number;
}

/** Lines to clear for each new level: the guideline fixed goal (design §3). */
const LINES_PER_LEVEL = 10;

/** The guideline's locking and preview values, which every mode shares. */
const GUIDELINE_LOCK_AND_PREVIEW = {
  lockDelay: LOCK_DELAY,
  maxLockResets: MAX_LOCK_RESETS,
  previewSize: PREVIEW_SIZE,
} as const;

/**
 * Marathon (design §4): the guideline gravity curve, a level every 10 lines, and a level cap of
 * 15, so clearing level 15's lines (150 in all) ends the game. The curve is the Tetris Worlds one
 * the guideline keeps, (0.8 − (level − 1) × 0.007) ^ (level − 1) seconds per row, to the nearest
 * sub-row per frame: from 1 row/s at level 1 to 2.36 rows per frame at level 15.
 */
export const MARATHON: Readonly<ModeSettings> = {
  gravity: [
    65_536, 82_643, 106_080, 138_633, 184_506, 250_134, 345_513, 486_408, 698_066, 1_021_580,
    1_524_935, 2_322_516, 3_610_137, 5_729_001, 9_284_539,
  ],
  linesPerLevel: LINES_PER_LEVEL,
  lineGoal: 150,
  frameLimit: null,
  ...GUIDELINE_LOCK_AND_PREVIEW,
};

/** Sprint (design §4): 1 row/s at level 1 throughout, ending on the lock that reaches 40 lines. */
export const SPRINT: Readonly<ModeSettings> = {
  gravity: [ONE_ROW_PER_SECOND],
  linesPerLevel: LINES_PER_LEVEL,
  lineGoal: 40,
  frameLimit: null,
  ...GUIDELINE_LOCK_AND_PREVIEW,
};

/** Ultra (design §4): 1 row/s at level 1 throughout, ending after 2 minutes (7,200 frames). */
export const ULTRA: Readonly<ModeSettings> = {
  gravity: [ONE_ROW_PER_SECOND],
  linesPerLevel: LINES_PER_LEVEL,
  lineGoal: null,
  frameLimit: 7_200,
  ...GUIDELINE_LOCK_AND_PREVIEW,
};
