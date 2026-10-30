import { describe, expect, test } from 'vitest';
import { PIECE_KINDS, sevenBag } from '../src/index';
import { draw } from './support/random';

describe('7-bag randomizer', () => {
  test('the same seed always yields the same sequence', () => {
    expect(draw(12345, 70)).toEqual(draw(12345, 70));
  });

  test('every run of 7 pieces from a bag boundary contains each piece once', () => {
    for (const seed of [0, 1, 42, 0xffffffff]) {
      const pieces = draw(seed, 7 * 50);
      for (let bag = 0; bag < 50; bag++) {
        const run = pieces.slice(bag * 7, bag * 7 + 7);
        expect(run.toSorted()).toEqual([...PIECE_KINDS].sort());
      }
    }
  });

  test('different seeds yield different sequences', () => {
    expect(draw(1, 14)).not.toEqual(draw(2, 14));
  });

  test('bags are shuffled, not dealt in a fixed order', () => {
    const firstBags = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((seed) => draw(seed, 7).join('')));
    expect(firstBags.size).toBeGreaterThan(1);
  });

  test('a copy of the state continues the same sequence', () => {
    const state = sevenBag.create(99);
    for (let i = 0; i < 10; i++) sevenBag.next(state);
    const copy = JSON.parse(JSON.stringify(state));
    const fromOriginal = Array.from({ length: 20 }, () => sevenBag.next(state));
    const fromCopy = Array.from({ length: 20 }, () => sevenBag.next(copy));
    expect(fromCopy).toEqual(fromOriginal);
  });

  test('seeds must be 32-bit unsigned integers', () => {
    expect(() => sevenBag.create(-1)).toThrow(RangeError);
    expect(() => sevenBag.create(1.5)).toThrow(RangeError);
    expect(() => sevenBag.create(2 ** 32)).toThrow(RangeError);
  });
});
