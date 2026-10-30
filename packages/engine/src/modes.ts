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
   * cap: the level rises no further, and levels above it fall at the last gravity. With
   * `gravityStep`, the gravity at each step of time instead, from the start of the game.
   */
  gravity: readonly number[];
  /**
   * Frames per step of a gravity curve that follows time rather than the level: frame `f` falls at
   * the `⌊f / gravityStep⌋`th gravity from 0, or the last one past the end. `null` to follow the
   * level.
   */
  gravityStep: number | null;
  /**
   * Lines to clear for each new level: the level is 1 + one per `linesPerLevel` lines, to the cap.
   * `null` keeps the level at 1.
   */
  linesPerLevel: number | null;
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
  /** The most garbage lines that land at one lock. The rest stays in the garbage meter. */
  garbageCap: number;
  /**
   * The frame margin time starts at, when attacks are first multiplied by 1.25, or `null` for a
   * mode without it.
   */
  marginTimeStart: number | null;
  /** Frames between margin time's steps: the multiplier grows by 0.25 at each. */
  marginTimeStep: number;
}

/** Lines to clear for each new level: the guideline fixed goal (design §3). */
const LINES_PER_LEVEL = 10;

/** The most garbage lines that land at one lock (design §3). */
const GARBAGE_CAP = 8;
/** Frames between margin time's steps: 30 s (design §3). */
const MARGIN_TIME_STEP = 1_800;

/**
 * The guideline's locking and preview values and the garbage values, which every mode shares.
 * Single-player modes never receive garbage, and have no margin time.
 */
const SHARED = {
  lockDelay: LOCK_DELAY,
  maxLockResets: MAX_LOCK_RESETS,
  previewSize: PREVIEW_SIZE,
  garbageCap: GARBAGE_CAP,
  marginTimeStep: MARGIN_TIME_STEP,
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
  gravityStep: null,
  linesPerLevel: LINES_PER_LEVEL,
  lineGoal: 150,
  frameLimit: null,
  marginTimeStart: null,
  ...SHARED,
};

/** Sprint (design §4): 1 row/s at level 1 throughout, ending on the lock that reaches 40 lines. */
export const SPRINT: Readonly<ModeSettings> = {
  gravity: [ONE_ROW_PER_SECOND],
  gravityStep: null,
  linesPerLevel: LINES_PER_LEVEL,
  lineGoal: 40,
  frameLimit: null,
  marginTimeStart: null,
  ...SHARED,
};

/** Ultra (design §4): 1 row/s at level 1 throughout, ending after 2 minutes (7,200 frames). */
export const ULTRA: Readonly<ModeSettings> = {
  gravity: [ONE_ROW_PER_SECOND],
  gravityStep: null,
  linesPerLevel: LINES_PER_LEVEL,
  lineGoal: null,
  frameLimit: 7_200,
  marginTimeStart: null,
  ...SHARED,
};

/** The fastest step of the versus gravity curve: 20 rows/s, from 9:30 on. */
const VERSUS_TOP_SPEED = 20;

/**
 * The versus modes' rules (design §3, §4). Gravity follows time: 1 row/s at first, 1 row/s faster
 * every 30 s, up to 20 rows/s from 9:30 on. The level stays at 1, garbage lands at most 8 lines a
 * lock, and margin time starts at 2:00 (frame 7,200). Only a top-out ends a player's game.
 */
const VERSUS: Readonly<ModeSettings> = {
  gravity: Array.from({ length: VERSUS_TOP_SPEED }, (_, step) => ONE_ROW_PER_SECOND * (step + 1)),
  gravityStep: 1_800,
  linesPerLevel: null,
  lineGoal: null,
  frameLimit: null,
  marginTimeStart: 7_200,
  ...SHARED,
};

/** 1v1 (design §4): two players, until one tops out. */
export const ONE_VS_ONE: Readonly<ModeSettings> = VERSUS;

/**
 * FFA (design §4): 3 to 8 players, until one remains. The engine plays it by 1v1's rules: who gets
 * the garbage is up to the server.
 */
export const FFA: Readonly<ModeSettings> = VERSUS;
