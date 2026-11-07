import { describe, expect, test } from 'vitest';
import {
  FLASH_MS,
  flashingAttack,
  followMeter,
  type MeterFlash,
} from '@/features/board/utils/meter-flash';

const meter = (...ids: number[]) => ids.map((id) => ({ id, lines: 2, holeSeed: 1 }));

describe('the garbage meter’s flash (design §13.2, Match)', () => {
  test('flashes the newest attack as it arrives, on and off, for a moment', () => {
    let flash: MeterFlash = followMeter(undefined, meter(), 0);
    flash = followMeter(flash, meter(4), 1_000);
    expect(flashingAttack(flash, 1_000)).toBe(4);
    const blinks = [0, 50, 100, 150, 200, 250].map((at) => flashingAttack(flash, 1_000 + at));
    expect(blinks).toContain(undefined);
    expect(blinks).toContain(4);
    expect(flashingAttack(flash, 1_000 + FLASH_MS)).toBeUndefined();
  });

  test('doesn’t flash what was already in the meter when it was first seen', () => {
    const flash = followMeter(undefined, meter(1, 2), 500);
    expect(flashingAttack(flash, 500)).toBeUndefined();
  });

  test('flashes a newer attack afresh, and nothing for one that landed or was cancelled', () => {
    let flash = followMeter(undefined, meter(1), 0);
    flash = followMeter(flash, meter(1, 2), 2_000);
    expect(flashingAttack(flash, 2_000)).toBe(2);
    const later = followMeter(flash, meter(2), 2_050);
    expect(later).toBe(flash);
    expect(followMeter(later, meter(), 2_100)).toBe(later);
  });
});
