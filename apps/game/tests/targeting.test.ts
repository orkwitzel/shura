import { describe, expect, test } from 'vitest';
import { chooseTarget, createMatchRng } from '../src/targeting';

/** `count` targets drawn one after another from a match RNG seeded with `seed`. */
function draws(seed: number, candidates: readonly string[], count: number): (string | undefined)[] {
  const rng = createMatchRng(seed);
  return Array.from({ length: count }, () => chooseTarget(rng, candidates));
}

describe('chooseTarget', () => {
  test('draws every player still in, and only them', () => {
    const targets = draws(7, ['b', 'c', 'd'], 300);
    expect(new Set(targets)).toEqual(new Set(['b', 'c', 'd']));
  });

  test('the same match seed draws the same targets in the same order', () => {
    expect(draws(42, ['b', 'c', 'd'], 50)).toEqual(draws(42, ['b', 'c', 'd'], 50));
    expect(draws(42, ['b', 'c', 'd'], 50)).not.toEqual(draws(43, ['b', 'c', 'd'], 50));
  });

  test('with one player left to aim at, always picks them, without drawing', () => {
    const rng = createMatchRng(5);
    const before = { ...rng };
    expect(chooseTarget(rng, ['b'])).toBe('b');
    expect(rng).toEqual(before);
  });

  test('with no one left to aim at, picks no one', () => {
    expect(chooseTarget(createMatchRng(5), [])).toBeUndefined();
  });
});
