import { assertInteger } from './assert';

/** Gravity counts in sub-rows: 60 × 2^16 per row, so any whole number of rows per second is exact. */
export const SUBROWS_PER_ROW = 3_932_160;

/** Gravity of 1 row per second, in sub-rows per frame. */
const ONE_ROW_PER_SECOND = 65_536;

/**
 * The rule values a mode fixes (design §3, §4), all whole numbers. A game ends at a top-out, or
 * when it meets the mode's line goal or frame limit.
 */
export interface ModeSettings {
  readonly gravity: GravityCurve;
  /**
   * Lines to clear for each new level: the level is 1 + one per `linesPerLevel` lines, up to the
   * level cap. `null` keeps the level at 1.
   */
  readonly linesPerLevel: number | null;
  /** Lines cleared that end the game, on the lock that reaches them, or `null` for no line goal. */
  readonly lineGoal: number | null;
  /** The frame the game ends at, after its actions and gravity, or `null` for no time limit. */
  readonly frameLimit: number | null;
  /** Frames a piece can rest on the stack before it locks. */
  readonly lockDelay: number;
  /** How many times moving or rotating on the stack can restart one piece's lock delay. */
  readonly maxLockResets: number;
  /** How many next pieces the queue shows. */
  readonly previewSize: number;
  /**
   * A versus mode's garbage rules, or `null` for a single-player mode, which sends and receives no
   * garbage.
   */
  readonly garbage: GarbageRules | null;
}

/** How fast the active piece falls: a list of speeds that follows the level or time. */
export interface GravityCurve {
  /** Sub-rows the active piece falls per frame at each speed, slowest first. */
  readonly speeds: readonly number[];
  /**
   * `null` for a curve that follows the level: level `n` falls at the `n`th speed, and the curve's
   * length is the level cap, so the level rises no further. Otherwise the frames between speed-ups
   * of a curve that follows time: frame `f` falls at the `⌊f / interval⌋`th speed from 0, or the
   * last one past the end.
   */
  readonly interval: number | null;
}

/** A versus mode's garbage rules (design §3). */
export interface GarbageRules {
  /** The most garbage lines that land at one lock. The rest stays in the garbage meter. */
  readonly cap: number;
  readonly marginTime: MarginTime;
}

/** When margin time multiplies attacks (design §3). */
export interface MarginTime {
  /** The frame margin time starts at, when attacks are first multiplied by 1.25. */
  readonly start: number;
  /** Frames between the multiplier's raises by 0.25. */
  readonly interval: number;
}

/** Throws a RangeError unless every mode setting is a whole number in its range. */
export function assertModeSettings(settings: ModeSettings): void {
  const { speeds, interval } = settings.gravity;
  if (speeds.length === 0) throw new RangeError('gravity must have at least one speed');
  for (const speed of speeds) assertInteger('gravity speed', speed, 1);
  if (interval !== null) assertInteger('gravity interval', interval, 1);
  if (settings.linesPerLevel !== null) {
    assertInteger('linesPerLevel', settings.linesPerLevel, 1);
  }
  if (settings.lineGoal !== null) assertInteger('lineGoal', settings.lineGoal, 1);
  if (settings.frameLimit !== null) assertInteger('frameLimit', settings.frameLimit, 1);
  assertInteger('lockDelay', settings.lockDelay, 1);
  assertInteger('maxLockResets', settings.maxLockResets, 0);
  assertInteger('previewSize', settings.previewSize, 0);
  if (settings.garbage !== null) {
    const { cap, marginTime } = settings.garbage;
    assertInteger('garbage cap', cap, 1);
    assertInteger('margin time start', marginTime.start, 1);
    assertInteger('margin time interval', marginTime.interval, 1);
  }
}

/** Frames a piece can rest on the stack before it locks (design §3). */
const LOCK_DELAY = 30;
/** How many times moving or rotating on the stack can restart one piece's lock delay (design §3). */
const MAX_LOCK_RESETS = 15;
/** How many next pieces the queue shows (design §3). */
const PREVIEW_SIZE = 5;
/** Lines to clear for each new level: the guideline fixed goal (design §3). */
const LINES_PER_LEVEL = 10;

/** The guideline's locking and preview values, which every mode shares. */
const GUIDELINE = {
  lockDelay: LOCK_DELAY,
  maxLockResets: MAX_LOCK_RESETS,
  previewSize: PREVIEW_SIZE,
} as const;

/** 1 row/s throughout, at level 1. */
const ONE_ROW_PER_SECOND_THROUGHOUT: GravityCurve = {
  speeds: [ONE_ROW_PER_SECOND],
  interval: null,
};

/**
 * The guideline gravity curve, levels 1 to 15: the Tetris Worlds one the guideline keeps,
 * (0.8 − (level − 1) × 0.007) ^ (level − 1) seconds per row, to the nearest sub-row per frame, from
 * 1 row/s at level 1 to 2.36 rows per frame at level 15.
 */
const GUIDELINE_GRAVITY: GravityCurve = {
  speeds: [
    65_536, 82_643, 106_080, 138_633, 184_506, 250_134, 345_513, 486_408, 698_066, 1_021_580,
    1_524_935, 2_322_516, 3_610_137, 5_729_001, 9_284_539,
  ],
  interval: null,
};

/**
 * Marathon (design §4): the guideline gravity curve, a level every 10 lines, and a level cap of
 * 15, so clearing level 15's lines (150 in all) ends the game.
 */
export const MARATHON: ModeSettings = {
  gravity: GUIDELINE_GRAVITY,
  linesPerLevel: LINES_PER_LEVEL,
  lineGoal: GUIDELINE_GRAVITY.speeds.length * LINES_PER_LEVEL,
  frameLimit: null,
  ...GUIDELINE,
  garbage: null,
};

/** Sprint (design §4): 1 row/s at level 1 throughout, ending on the lock that reaches 40 lines. */
export const SPRINT: ModeSettings = {
  gravity: ONE_ROW_PER_SECOND_THROUGHOUT,
  linesPerLevel: null,
  lineGoal: 40,
  frameLimit: null,
  ...GUIDELINE,
  garbage: null,
};

/** Ultra (design §4): 1 row/s at level 1 throughout, ending after 2 minutes (7,200 frames). */
export const ULTRA: ModeSettings = {
  gravity: ONE_ROW_PER_SECOND_THROUGHOUT,
  linesPerLevel: null,
  lineGoal: null,
  frameLimit: 7_200,
  ...GUIDELINE,
  garbage: null,
};

/** The fastest speed of the versus gravity curve: 20 rows/s, from 9:30 on. */
const VERSUS_TOP_SPEED = 20;

/**
 * The versus modes' rules (design §3, §4). Gravity follows time: 1 row/s at first, 1 row/s faster
 * every 30 s, up to 20 rows/s from 9:30 on. The level stays at 1, garbage lands at most 8 lines a
 * lock, and margin time starts at 2:00 (frame 7,200) and raises the multiplier every 30 s. Only a
 * top-out ends a player's game.
 */
const VERSUS: ModeSettings = {
  gravity: {
    speeds: Array.from({ length: VERSUS_TOP_SPEED }, (_, i) => ONE_ROW_PER_SECOND * (i + 1)),
    interval: 1_800,
  },
  linesPerLevel: null,
  lineGoal: null,
  frameLimit: null,
  ...GUIDELINE,
  garbage: { cap: 8, marginTime: { start: 7_200, interval: 1_800 } },
};

/** 1v1 (design §4): two players, until one tops out. */
export const ONE_VS_ONE: ModeSettings = VERSUS;

/**
 * FFA (design §4): 3 to 8 players, until one remains. The engine plays it by 1v1's rules: who gets
 * the garbage is up to the server.
 */
export const FFA: ModeSettings = VERSUS;
