import { describe, expect, test } from 'vitest';
import { matchResultRows, OUT_WORDS, ordinal, placeOf, RESULTS_MS } from '../../src/index';

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

describe('ordinal (the lobby’s last place, design §13.2)', () => {
  test.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [8, '8th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [102, '102nd'],
  ])('%i is %s', (place, words) => {
    expect(ordinal(place)).toBe(words);
  });
});

describe('a match’s results as rows (design §13.2, Results)', () => {
  const result = {
    placements: [
      { playerId: 'cy', place: 3, reason: 'toppedOut' as const, frame: 400 },
      { playerId: 'ada', place: 1 },
      { playerId: 'bo', place: 1 },
    ],
    stats: [
      { playerId: 'ada', linesSent: 12, apm: 40.5, pps: 1.25 },
      { playerId: 'cy', linesSent: 3, apm: 10, pps: 0.8 },
    ],
  };

  test('lists every player by place, with their stats, zero for a player with none', () => {
    const { rows } = matchResultRows(result, 'cy');
    expect(rows).toEqual([
      { playerId: 'ada', place: 1, linesSent: 12, apm: 40.5, pps: 1.25, you: false },
      { playerId: 'bo', place: 1, linesSent: 0, apm: 0, pps: 0, you: false },
      { playerId: 'cy', place: 3, linesSent: 3, apm: 10, pps: 0.8, you: true },
    ]);
  });

  test('gives your row and the winners, sharing first place', () => {
    const { mine, winners } = matchResultRows(result, 'cy');
    expect(mine?.place).toBe(3);
    expect(winners).toEqual(['ada', 'bo']);
    expect(matchResultRows(result, null).mine).toBeNull();
  });

  test('stay up 10 s in a room with a code', () => {
    expect(RESULTS_MS).toBe(10_000);
  });
});

describe('how a player went out, in words (design §13.2)', () => {
  test.each([
    ['toppedOut', 'topped out'],
    ['laggedOut', 'lagged out'],
    ['removed', 'removed'],
    ['left', 'left'],
  ] as const)('%s is "%s"', (reason, words) => {
    expect(OUT_WORDS[reason]).toBe(words);
  });
});
