import { describe, expect, it } from 'vitest';
import { type OnlinePlayerGame, placeOf } from '../src/index';

/** A match of players, each out at the frame given (`null`: still in). */
function matchOf(outAt: Record<string, number | null>) {
  const players = Object.entries(outAt).map(
    ([playerId, frame], index) =>
      ({
        playerId,
        index,
        out: frame === null ? null : { reason: 'toppedOut', frame },
      }) as OnlinePlayerGame,
  );
  return { players, result: null };
}

describe('a player’s place (design §10.1, Placements by frame)', () => {
  it('is none for a player still in', () => {
    expect(placeOf(matchOf({ ada: null, bo: 300 }), 'ada')).toBeNull();
  });

  it('counts the players still in and out later, sharing a place with anyone out at the frame', () => {
    const match = matchOf({ ada: null, bo: 900, cy: 400, dan: 400, eve: 100 });
    expect(placeOf(match, 'bo')).toBe(2);
    expect(placeOf(match, 'cy')).toBe(3);
    expect(placeOf(match, 'dan')).toBe(3);
    expect(placeOf(match, 'eve')).toBe(5);
  });

  it('is the server’s once the match has ended', () => {
    const match = {
      ...matchOf({ ada: null, bo: 900 }),
      result: {
        type: 'matchEnd' as const,
        placements: [
          { playerId: 'bo', place: 1 },
          { playerId: 'ada', place: 2, reason: 'toppedOut' as const, frame: 950 },
        ],
        stats: [],
      },
    };
    expect(placeOf(match, 'ada')).toBe(2);
  });
});
