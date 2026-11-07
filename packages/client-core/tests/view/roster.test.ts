import { expect, test } from 'vitest';
import { kindOf, nicknameOf, rosterEntryOf, UNKNOWN_NICKNAME } from '../../src/index';

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

test('a player’s kind, guest or bot, from the room’s seats and spectators', () => {
  const room = {
    players: [
      { id: 'ada', nickname: 'Ada', kind: 'guest' as const, seat: 0, ready: false },
      { id: 'bo', nickname: 'Bo', kind: 'bot' as const, seat: 1, ready: false },
    ],
    spectators: [{ id: 'cy', nickname: 'Cy', kind: 'bot' as const }],
  };
  expect(kindOf(room, 'ada')).toBe('guest');
  expect(kindOf(room, 'bo')).toBe('bot');
  expect(kindOf(room, 'cy')).toBe('bot');
  // Someone who has left the room, or no room at all.
  expect(kindOf(room, 'dan')).toBeNull();
  expect(kindOf(null, 'ada')).toBeNull();
});
