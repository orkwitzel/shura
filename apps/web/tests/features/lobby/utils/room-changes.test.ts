import { describe, expect, test } from 'vitest';
import { roomChanges } from '@/features/lobby/utils/room-changes';
import { lobby, seated, watching } from '../../../support/fake-online-session';

const mira = seated('mira', 1, { nickname: 'Mira' });

describe('roomChanges', () => {
  test('says who joined, seated or watching', () => {
    const before = lobby();
    const after = lobby({
      players: [seated('me', 0), mira],
      spectators: [watching('tal', { nickname: 'Tal' })],
    });
    expect(roomChanges(before, after, 'me')).toEqual(['Mira joined', 'Tal joined']);
  });

  test('says who left', () => {
    const before = lobby({ players: [seated('me', 0), mira] });
    expect(roomChanges(before, lobby(), 'me')).toEqual(['Mira left']);
  });

  test('says nothing of a seat move, or of a change of ready', () => {
    const before = lobby({ players: [seated('me', 0), mira] });
    const after = lobby({
      players: [seated('me', 0)],
      spectators: [watching('mira', { nickname: 'Mira' })],
    });
    expect(roomChanges(before, after, 'me')).toEqual([]);
    const ready = lobby({ players: [seated('me', 0), { ...mira, ready: true }] });
    expect(roomChanges(before, ready, 'me')).toEqual([]);
  });

  test('says who is host now, or that you are', () => {
    const before = lobby({ hostId: 'tal', players: [seated('me', 0), mira] });
    expect(roomChanges(before, { ...before, hostId: 'mira' }, 'me')).toEqual(['Mira is now host']);
    expect(roomChanges(before, { ...before, hostId: 'me' }, 'me')).toEqual(['You are now host']);
  });

  test('says nothing of your own coming, nor between two rooms', () => {
    expect(roomChanges(null, lobby(), 'me')).toEqual([]);
    const other = lobby({ code: 'ABCD', players: [seated('me', 0), mira] });
    expect(roomChanges(lobby(), other, 'me')).toEqual([]);
  });
});
