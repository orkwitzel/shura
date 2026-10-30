import type { ModeSettings } from './modes';
import { isDifficult, type LockClear } from './scoring';
import { TSpin } from './t-spin';

/**
 * Garbage lines a clear sends (design §3), by lines cleared, for a lock that isn't a T-spin, a mini
 * and a full T-spin. A mini clears at most 2 lines and a full T-spin at most 3.
 */
const CLEAR_ATTACK: Readonly<Record<TSpin, readonly number[]>> = {
  [TSpin.None]: [0, 0, 1, 2, 4],
  [TSpin.Mini]: [0, 1, 1],
  [TSpin.Full]: [0, 2, 4, 6],
};
/** Extra lines for a back-to-back difficult clear. */
const BACK_TO_BACK_ATTACK = 1;
/** Extra lines by the combo counter after the clear, from 0; the last applies to every combo past it. */
const COMBO_ATTACK = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5] as const;
/** Extra lines for a perfect clear, on top of everything else. */
const PERFECT_CLEAR_ATTACK = 10;

/** The back-to-back and combo chain, as the fields of `EngineState` hold it before a lock. */
export interface ClearChain {
  /** The combo counter: -1 after a lock that cleared nothing. */
  combo: number;
  /** Whether the last line clear was a difficult clear. */
  backToBack: boolean;
}

/**
 * Multiplies an attack made at `frame` for margin time (design §3): by 1.25 from the frame margin
 * time starts at, and by 0.25 more every `marginTimeStep` frames after it, rounded down to whole
 * lines. A mode without margin time leaves the attack as it is.
 */
export function applyMarginTime(
  attack: number,
  frame: number,
  { marginTimeStart, marginTimeStep }: Pick<ModeSettings, 'marginTimeStart' | 'marginTimeStep'>,
): number {
  if (marginTimeStart === null || frame < marginTimeStart) return attack;
  // Whole numbers both: the quotient floors exactly.
  const steps = 1 + Math.floor((frame - marginTimeStart) / marginTimeStep);
  // The multiplier in quarters, 4 being ×1.
  return (attack * (4 + steps)) >> 2;
}

/**
 * The attack of a lock (design §3), before margin time and cancellation: the clear's lines from
 * the attack table, plus 1 for a back-to-back difficult clear, the combo bonus, and 10 for a
 * perfect clear. `chain` is the chain before the lock. A lock that clears nothing sends nothing.
 */
export function calculateAttack(chain: Readonly<ClearChain>, clear: Readonly<LockClear>): number {
  const { lines, tSpin, perfectClear } = clear;
  if (lines === 0) return 0;
  const base = CLEAR_ATTACK[tSpin][lines];
  if (base === undefined) throw new RangeError(`a ${tSpin} T-spin can't clear ${lines} lines`);
  const combo = Math.min(chain.combo + 1, COMBO_ATTACK.length - 1);
  return (
    base +
    (chain.backToBack && isDifficult(clear) ? BACK_TO_BACK_ATTACK : 0) +
    (COMBO_ATTACK[combo] as number) +
    (perfectClear ? PERFECT_CLEAR_ATTACK : 0)
  );
}
