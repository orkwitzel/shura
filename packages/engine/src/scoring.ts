import type { ClearedLines } from './board';

/** Points for each row a `softDrop` moves the piece down. Drop points aren't times the level. */
export const SOFT_DROP_POINTS = 1;
/** Points for each row a hard drop moves the piece down. */
export const HARD_DROP_POINTS = 2;

/**
 * Guideline points at level 1 (design §3) for clearing 1, 2, 3 and 4 lines, and the perfect clear
 * bonus on top of them when the clear leaves the board empty.
 */
const CLEARS = {
  1: { points: 100, perfectClear: 800 },
  2: { points: 300, perfectClear: 1200 },
  3: { points: 500, perfectClear: 1800 },
  4: { points: 800, perfectClear: 2000 },
} as const;
/** Points per combo, times the combo counter. */
const COMBO_POINTS = 50;
/** The perfect clear bonus for a back-to-back Tetris, in place of 2000. */
const BACK_TO_BACK_TETRIS_PERFECT_CLEAR_POINTS = 3200;

/** What a lock cleared. */
export interface LockClear {
  lines: ClearedLines;
  /** Whether the clear left the board empty. */
  perfectClear: boolean;
}

/** The fields of `EngineState` that scoring reads and writes. */
export interface ScoringState {
  level: number;
  score: number;
  combo: number;
  backToBack: boolean;
}

/**
 * Scores a lock (design §3). Points are the guideline's: the clear, half as much again for a
 * back-to-back Tetris, the combo bonus, and the perfect clear bonus, all times the level.
 */
export function scoreLock(s: ScoringState, { lines, perfectClear }: LockClear): void {
  if (lines === 0) {
    s.combo = -1;
    return;
  }
  s.combo++;
  const clear = CLEARS[lines];
  let points = clear.points * s.level;
  // A Tetris is the only difficult clear until T-spins score.
  const difficult = lines === 4;
  const backToBackBonus = difficult && s.backToBack;
  // Every clear's points are a multiple of 100, so half of them is a whole number.
  if (backToBackBonus) points += points >> 1;
  points += COMBO_POINTS * s.combo * s.level;
  if (perfectClear) {
    const bonus = backToBackBonus ? BACK_TO_BACK_TETRIS_PERFECT_CLEAR_POINTS : clear.perfectClear;
    points += bonus * s.level;
  }
  s.backToBack = difficult;
  s.score += points;
}
