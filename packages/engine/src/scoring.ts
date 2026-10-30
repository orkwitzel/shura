import { isEmpty } from './board';
import type { EngineState } from './engine';

/** Points for each row a `softDrop` moves the piece down. Drop points aren't times the level. */
export const SOFT_DROP_POINTS = 1;
/** Points for each row a hard drop moves the piece down. */
export const HARD_DROP_POINTS = 2;

/** Guideline points for clearing 1, 2, 3 and 4 lines at level 1 (design §3), indexed by lines. */
const LINE_CLEAR_POINTS = [0, 100, 300, 500, 800] as const;
/** Points per combo, times the combo counter. */
const COMBO_POINTS = 50;
/** The perfect clear bonus at level 1, on top of the clear's own points, indexed by lines. */
const PERFECT_CLEAR_POINTS = [0, 800, 1200, 1800, 2000] as const;
/** The perfect clear bonus for a back-to-back Tetris, in place of 2000. */
const BACK_TO_BACK_TETRIS_PERFECT_CLEAR_POINTS = 3200;

/**
 * Scores a lock that cleared `lines` lines (design §3), after the clear. Points are the guideline's:
 * the clear, half as much again for a back-to-back Tetris, the combo bonus, and the perfect clear
 * bonus if the board is left empty, all times the level.
 */
export function scoreLock(s: EngineState, lines: number): void {
  if (lines === 0) {
    s.combo = -1;
    return;
  }
  s.linesCleared += lines;
  s.combo++;
  let points = (LINE_CLEAR_POINTS[lines] ?? 0) * s.level;
  // A Tetris is the only difficult clear until T-spins score.
  const difficult = lines === 4;
  const backToBackBonus = difficult && s.backToBack;
  // Every clear's points are a multiple of 100, so half of them is a whole number.
  if (backToBackBonus) points += points >> 1;
  points += COMBO_POINTS * s.combo * s.level;
  if (isEmpty(s.board)) {
    const bonus = backToBackBonus
      ? BACK_TO_BACK_TETRIS_PERFECT_CLEAR_POINTS
      : PERFECT_CLEAR_POINTS[lines];
    points += (bonus ?? 0) * s.level;
  }
  s.backToBack = difficult;
  s.score += points;
}
