import { describe, expect, test } from 'vitest';
import { placeOf } from '../../src/index';

const out = (frame: number) => ({ reason: 'toppedOut' as const, frame });

describe("a player's place (design §10.1)", () => {
  const match = {
    players: [
      { playerId: 'ada', out: null },
      { playerId: 'bo', out: out(300) },
      { playerId: 'cy', out: out(300) },
      { playerId: 'di', out: out(200) },
    ],
    result: null,
  };

  test('is none while they are still in', () => {
    expect(placeOf(match, 'ada')).toBeNull();
  });

  test('before the end, is the one their out frame gives so far, shared at the same frame', () => {
    expect(placeOf(match, 'bo')).toBe(2);
    expect(placeOf(match, 'cy')).toBe(2);
    expect(placeOf(match, 'di')).toBe(4);
  });

  test("once it has ended, is the server's", () => {
    const ended = {
      ...match,
      result: {
        placements: [
          { playerId: 'ada', place: 1 },
          { playerId: 'bo', place: 2 },
          { playerId: 'cy', place: 2 },
          { playerId: 'di', place: 4 },
        ],
        stats: [],
      },
    };
    expect(placeOf(ended, 'ada')).toBe(1);
  });

  test('is none for someone not in the match', () => {
    expect(placeOf(match, 'eve')).toBeNull();
  });
});
