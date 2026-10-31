import { describe, expect, test } from 'vitest';
import { colorNumber, shade } from '@/utils/color';

describe('shade', () => {
  test('0 is the colour itself', () => {
    expect(shade([200, 107, 250], 0)).toEqual([200, 107, 250]);
  });

  test('a negative shade darkens toward black by that much', () => {
    // 55 % of the way to black leaves 45 %: 200 × 0.45 = 90, 107 × 0.45 = 48.15, 250 × 0.45 = 112.5.
    expect(shade([200, 107, 250], -0.55)).toEqual([90, 48, 113]);
    expect(shade([200, 107, 250], -1)).toEqual([0, 0, 0]);
  });

  test('a positive shade lightens toward white by that much', () => {
    // 40 % of the way to 255: 200 + 55 × 0.4 = 222, 107 + 148 × 0.4 = 166.2, 250 + 5 × 0.4 = 252.
    expect(shade([200, 107, 250], 0.4)).toEqual([222, 166, 252]);
    expect(shade([200, 107, 250], 1)).toEqual([255, 255, 255]);
  });
});

describe('colorNumber', () => {
  test('packs a colour as 0xRRGGBB', () => {
    expect(colorNumber([0x12, 0x34, 0x56])).toBe(0x123456);
  });
});
