import type { Effects, GarbageRouting } from '@shura/client-core';

/** An attack streak (design §13.2, Match): pixels flying from `from`'s board to `to`'s meter. */
export interface StreakEffect {
  readonly type: 'streak';
  /** The attacker's player id. */
  readonly from: string;
  /** The target's player id. */
  readonly to: string;
  /** The attack's lines, which the streak grows with. */
  readonly lines: number;
}

/**
 * The attack streaks a match's garbage routings make, one each, under the *Effects* setting in
 * force: under *Full* and *Reduced* (they tell who attacked whom, as the callouts tell a clear, so
 * *Reduced* keeps them), and none with effects *Off*. It only describes them.
 */
export function streaksForRoutings(
  routings: readonly GarbageRouting[],
  setting: Effects,
): StreakEffect[] {
  if (setting === 'off') return [];
  return routings.map(({ from, to, lines }) => ({ type: 'streak', from, to, lines }));
}
