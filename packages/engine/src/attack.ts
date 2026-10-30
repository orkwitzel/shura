import type { MarginTime } from './modes';
import { isDifficult, type LockClear, type ScoringState } from './scoring';
import { TSpin } from './t-spin';

/**
 * Garbage lines a clear sends (design §3), by lines cleared, for a lock that isn't a T-spin, a mini
 * and a full T-spin. A mini clears at most 2 lines and a full T-spin at most 3.
 */
const CLEAR_ATTACK: Readonly<Record<TSpin, readonly number[]>> = {
  [TSpin.None]: [0, 0, 1, 2, 4],
  [TSpin.Mini]: [0, 0, 1],
  [TSpin.Full]: [0, 2, 4, 6],
};
/** Extra lines for a back-to-back difficult clear. */
const BACK_TO_BACK_ATTACK = 1;
/** Extra lines by the combo counter after the clear, from 0; the last applies to every combo past it. */
const COMBO_ATTACK = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5] as const;
/** Extra lines for a perfect clear, on top of everything else. */
const PERFECT_CLEAR_ATTACK = 10;

/**
 * What the locks before a lock leave its attack: the combo counter and back-to-back status, as
 * scoring keeps them before the lock.
 */
export type ClearHistory = Pick<ScoringState, 'combo' | 'backToBack'>;

/**
 * Multiplies an attack made at `frame` for margin time (design §3): by 1.25 from the frame margin
 * time starts at, and by 0.25 more every `interval` frames after it. The multiplied attack, in
 * quarter-lines, adds `carry`, the quarter-lines the last attack's rounding left over, then sends
 * the whole lines and carries what is left (0 to 3) to the next attack, so margin time loses no
 * lines. Before margin time starts, the attack and the carry stay as they are.
 */
export function applyMarginTime(
  attack: number,
  frame: number,
  { start, interval }: MarginTime,
  carry: number,
): { lines: number; carry: number } {
  if (frame < start) return { lines: attack, carry };
  // Whole numbers both: the quotient floors exactly.
  const raises = 1 + Math.floor((frame - start) / interval);
  // The multiplier in quarters, 4 being ×1.
  const quarters = attack * (4 + raises) + carry;
  return { lines: quarters >> 2, carry: quarters & 3 };
}

/**
 * The attack of a lock (design §3), before margin time and cancellation: the clear's lines from
 * the attack table, plus 1 for a back-to-back difficult clear, the combo bonus, and 10 for a
 * perfect clear. `history` is what the locks before it left. A lock that clears nothing sends
 * nothing.
 */
export function calculateAttack(
  history: Readonly<ClearHistory>,
  clear: Readonly<LockClear>,
): number {
  const { lines, tSpin, perfectClear } = clear;
  if (lines === 0) return 0;
  const base = CLEAR_ATTACK[tSpin][lines];
  if (base === undefined) throw new RangeError(`a ${tSpin} T-spin can't clear ${lines} lines`);
  const combo = Math.min(history.combo + 1, COMBO_ATTACK.length - 1);
  return (
    base +
    (history.backToBack && isDifficult(clear) ? BACK_TO_BACK_ATTACK : 0) +
    (COMBO_ATTACK[combo] as number) +
    (perfectClear ? PERFECT_CLEAR_ATTACK : 0)
  );
}
