import { assertInteger } from './assert';
import { BOARD_WIDTH } from './board';
import { nextRandom } from './random';

/**
 * One attack waiting in a garbage meter (design §8.5): `garbageQueued{id, lines, holeSeed}` as the
 * server sends it. `lines` is what is still to land.
 */
export interface GarbageEntry {
  id: number;
  lines: number;
  /** Picks the column of the hole every line of this attack shares. */
  holeSeed: number;
}

/**
 * The column of the hole in every line of the attack with `holeSeed` (design §3), from one draw of
 * the engine's PRNG seeded with it, so any seed, even one of a run of consecutive seeds, gives a
 * random column. After an attack with its hole in column `previous`, it is one of the other 9
 * columns, so the hole always moves between attacks. With no `previous`, it is any of the 10.
 */
export function holeColumn(holeSeed: number, previous: number | null): number {
  const [value] = nextRandom(holeSeed);
  if (previous === null) return value % BOARD_WIDTH;
  return (previous + 1 + (value % (BOARD_WIDTH - 1))) % BOARD_WIDTH;
}

/**
 * Cancels `attack` lines against a garbage meter (design §3): they take lines off the oldest entry
 * first, removing each entry they empty, and only the remainder is sent on. Returns the new meter
 * and the remainder, leaving `meter` as it was.
 */
export function cancelGarbage(
  meter: readonly Readonly<GarbageEntry>[],
  attack: number,
): { meter: GarbageEntry[]; remainder: number } {
  assertInteger('attack', attack, 0);
  let remainder = attack;
  const left: GarbageEntry[] = [];
  for (const entry of meter) {
    const cancelled = Math.min(remainder, entry.lines);
    remainder -= cancelled;
    if (cancelled < entry.lines) left.push({ ...entry, lines: entry.lines - cancelled });
  }
  return { meter: left, remainder };
}
