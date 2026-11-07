import type { GarbageEntry } from '@shura/engine';

/** How long a new attack flashes in the garbage meter, in ms. */
export const FLASH_MS = 600;
/** How long each blink of it is on, and then off. */
const BLINK_MS = 100;

/** The newest attack a garbage meter has had, and when it arrived (ms). */
export interface MeterFlash {
  readonly id: number | null;
  readonly since: number;
}

/**
 * Follows a garbage meter's newest attack: one newer than the last seen arrives at `now`.
 * Attacks only ever arrive newest last, so a meter whose last attack is the one seen (or older,
 * once it has landed) is unchanged, and so is the result. What a meter holds when it is first seen
 * arrived before, and doesn't flash.
 */
export function followMeter(
  last: MeterFlash | undefined,
  meter: readonly GarbageEntry[],
  now: number,
): MeterFlash {
  const newest = meter.at(-1)?.id ?? null;
  if (!last) return { id: newest, since: Number.NEGATIVE_INFINITY };
  if (newest === null || (last.id !== null && newest <= last.id)) return last;
  return { id: newest, since: now };
}

/**
 * The attack to draw flashing at `now` (`layoutBoard`'s `flash`): the newest, blinking for
 * `FLASH_MS` after it arrived, or none.
 */
export function flashingAttack(flash: MeterFlash, now: number): number | undefined {
  const elapsed = now - flash.since;
  if (flash.id === null || elapsed < 0 || elapsed >= FLASH_MS) return undefined;
  return Math.floor(elapsed / BLINK_MS) % 2 === 0 ? flash.id : undefined;
}
