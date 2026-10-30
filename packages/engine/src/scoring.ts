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
 * Scores a lock (design §3). Points are the guideline's: the clear or T-spin, half as much again
 * for a back-to-back difficult clear, the combo bonus, and the perfect clear bonus, all times the
 * level. A T-spin that clears nothing scores its points but no bonus.
 */
export function scoreLock(s: ScoringState, { lines, tSpin, perfectClear }: LockClear): void {
  const points = CLEAR_POINTS[tSpin][lines];
  if (points === undefined) throw new RangeError(`a ${tSpin} T-spin can't clear ${lines} lines`);
  let scored = points * s.level;
  if (lines === 0) {
    s.combo = -1;
    s.score += scored;
    return;
  }
  s.combo++;
  const tetris = lines === 4;
  // The difficult clears: a Tetris, and a T-spin that clears lines.
  const difficult = tetris || tSpin !== TSpin.None;
  const backToBackBonus = difficult && s.backToBack;
  // Every clear's points are a multiple of 100, so half of them is a whole number.
  if (backToBackBonus) scored += scored >> 1;
  scored += COMBO_POINTS * s.combo * s.level;
  if (perfectClear) {
    const bonus =
      backToBackBonus && tetris
        ? BACK_TO_BACK_TETRIS_PERFECT_CLEAR_POINTS
        : PERFECT_CLEAR_POINTS[lines];
    scored += bonus * s.level;
  }
  s.backToBack = difficult;
  s.score += scored;
}
