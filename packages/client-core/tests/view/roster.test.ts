import { expect, test } from 'vitest';
import { nicknameOf, rosterEntryOf, UNKNOWN_NICKNAME } from '../../src/index';

test('a nickname seen in the room, or one word for a player never seen', () => {
  const names = new Map([['ada', 'Ada']]);
  expect(nicknameOf(names, 'ada')).toBe('Ada');
  expect(nicknameOf(names, 'bo')).toBe(UNKNOWN_NICKNAME);
  expect(UNKNOWN_NICKNAME).toBe('player');
});

test('a player’s roster entry: how they went out and their place, or nothing if not in it', () => {
  const out = { reason: 'toppedOut' as const, frame: 40 };
  const match = {
    roster: [
      { playerId: 'ada', out: null, place: null },
      { playerId: 'bo', out, place: 2 },
    ],
  };
  expect(rosterEntryOf(match, 'bo')).toEqual({ playerId: 'bo', out, place: 2 });
  expect(rosterEntryOf(match, 'ada')?.place).toBeNull();
  expect(rosterEntryOf(match, 'cy')).toBeUndefined();
});
