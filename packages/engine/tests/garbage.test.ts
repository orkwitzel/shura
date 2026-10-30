import { describe, expect, test } from 'vitest';
import { BOARD_WIDTH, cancelGarbage, type GarbageEntry, holeColumn, holeSeeds } from '../src/index';

const A: GarbageEntry = { id: 1, lines: 3, holeSeed: 11 };
const B: GarbageEntry = { id: 2, lines: 5, holeSeed: 22 };

/** The first `count` hole seeds of a player's garbage RNG. */
function seedsOf(seed: number, playerIndex: number, count = 20): number[] {
  const state = holeSeeds.create(seed, playerIndex);
  return Array.from({ length: count }, () => holeSeeds.next(state));
}

describe('hole columns', () => {
  test('are the same for the same hole seed', () => {
    for (const seed of [0, 1, 99, 0xffffffff]) expect(holeColumn(seed)).toBe(holeColumn(seed));
  });

  test('are on the board, and consecutive seeds spread over every column', () => {
    const columns = Array.from({ length: 200 }, (_, seed) => holeColumn(seed));
    for (const column of columns) expect(column).toBeGreaterThanOrEqual(0);
    for (const column of columns) expect(column).toBeLessThan(BOARD_WIDTH);
    expect(new Set(columns).size).toBe(BOARD_WIDTH);
  });
});

describe("a player's garbage RNG", () => {
  test('gives the same hole seeds for the same match seed and player', () => {
    expect(seedsOf(42, 1)).toEqual(seedsOf(42, 1));
  });

  test('is seeded separately for each player', () => {
    const players = [0, 1, 2, 7].map((player) => seedsOf(42, player));
    for (const [i, seeds] of players.entries()) {
      for (const other of players.slice(i + 1)) expect(seeds).not.toEqual(other);
    }
  });

  test('differs between match seeds', () => {
    expect(seedsOf(42, 0)).not.toEqual(seedsOf(43, 0));
  });

  test('gives 32-bit unsigned hole seeds that move the hole between attacks', () => {
    const seeds = seedsOf(5, 0, 50);
    expect(seeds.every((seed) => Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32)).toBe(true);
    expect(new Set(seeds.map(holeColumn)).size).toBeGreaterThan(5);
  });

  test('carries on from a copy of its state', () => {
    const state = holeSeeds.create(8, 3);
    holeSeeds.next(state);
    const copy = JSON.parse(JSON.stringify(state));
    expect(holeSeeds.next(copy)).toBe(holeSeeds.next(state));
  });
});

describe('cancellation', () => {
  test('with an empty meter sends the whole attack', () => {
    expect(cancelGarbage([], 4)).toEqual({ meter: [], remainder: 4 });
  });

  test('takes lines off the oldest entry first', () => {
    expect(cancelGarbage([A, B], 2)).toEqual({ meter: [{ ...A, lines: 1 }, B], remainder: 0 });
  });

  test('removes entries it cancels completely and moves on to the next', () => {
    expect(cancelGarbage([A, B], 4)).toEqual({ meter: [{ ...B, lines: 4 }], remainder: 0 });
  });

  test('sends only what is left once the meter is empty', () => {
    expect(cancelGarbage([A, B], 10)).toEqual({ meter: [], remainder: 2 });
  });

  test('an attack of 0 changes nothing', () => {
    expect(cancelGarbage([A, B], 0)).toEqual({ meter: [A, B], remainder: 0 });
  });

  test("doesn't change the meter it is given", () => {
    const meter = [A, B];
    cancelGarbage(meter, 4);
    expect(meter).toEqual([A, B]);
    expect(A.lines).toBe(3);
  });

  test('rejects a negative or fractional attack', () => {
    expect(() => cancelGarbage([A], -1)).toThrow(RangeError);
    expect(() => cancelGarbage([A], 1.5)).toThrow(RangeError);
  });
});
