import type { ClearedLines } from './board';
import { TSpin } from './t-spin';

/** Points for each row a `softDrop` moves the piece down. Drop points aren't times the level. */
export const SOFT_DROP_POINTS = 1;
/** Points for each row a hard drop moves the piece down. */
export const HARD_DROP_POINTS = 2;

/**
 * Guideline points at level 1 (design §3) by lines cleared, for a lock that isn't a T-spin, a mini
 * and a full T-spin. A T covers 3 rows at most, and a T that clears 3 fills both of its front
 * corners, so a mini clears at most 2 lines and a full T-spin at most 3.
 */
const CLEAR_POINTS: Readonly<Record<TSpin, readonly number[]>> = {
  [TSpin.None]: [0, 100, 300, 500, 800],
  [TSpin.Mini]: [100, 200, 400],
  [TSpin.Full]: [400, 800, 1200, 1600],
};
/** The perfect clear bonus by lines cleared, on top of the clear's points. */
const PERFECT_CLEAR_POINTS = [0, 800, 1200, 1800, 2000] as const;
/** Points per combo, times the combo counter. */
const COMBO_POINTS = 50;
/** The perfect clear bonus for a back-to-back Tetris, in place of 2000. */
const BACK_TO_BACK_TETRIS_PERFECT_CLEAR_POINTS = 3200;

/** What a lock cleared. */
export interface LockClear {
  lines: ClearedLines;
  /** Whether the lock was a T-spin, and which kind. */
  tSpin: TSpin;
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
 * Whether a lock is a difficult clear, which chains back-to-back: a Tetris, or a T-spin or mini that
 * clears lines.
 */
export function isDifficult({ lines, tSpin }: Pick<LockClear, 'lines' | 'tSpin'>): boolean {
  return lines === 4 || (lines > 0 && tSpin !== TSpin.None);
}

/**
 * Scores a lock (design §3). Points are the guideline's: the clear or T-spin, half as much again
 * for a back-to-back difficult clear, the combo bonus, and the perfect clear bonus, all times the
 * level. A T-spin that clears nothing scores its points but no bonus.
 */
export function scoreLock(s: ScoringState, { lines, tSpin, perfectClear }: LockClear): void {
  const points = CLEAR_POINTS[tSpin][lines];
  if (points === undefined) throw new RangeError(`a ${tSpin} T-spin can't clear ${lines} lines`);
  s.score += points * s.level;
  if (lines === 0) {
    s.combo = -1;
    return;
  }
  s.combo++;
  const tetris = lines === 4;
  const difficult = isDifficult({ lines, tSpin });
  const backToBackBonus = difficult && s.backToBack;
  // Every clear's points are a multiple of 100, so half of them is a whole number.
  if (backToBackBonus) s.score += (points * s.level) >> 1;
  s.score += COMBO_POINTS * s.combo * s.level;
  if (perfectClear) {
    const bonus =
      backToBackBonus && tetris
        ? BACK_TO_BACK_TETRIS_PERFECT_CLEAR_POINTS
        : PERFECT_CLEAR_POINTS[lines];
    s.score += bonus * s.level;
  }
  s.backToBack = difficult;
}
