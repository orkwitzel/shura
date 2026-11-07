import { describe, expect, test } from 'vitest';
import { lobbyRole, MODE_NAMES, type OnlineRoom, roomChanges } from '../../src/index';

type Player = OnlineRoom['players'][number];

const seated = (id: string, seat: number, more: Partial<Player> = {}): Player => ({
  id,
  nickname: id,
  kind: 'guest',
  seat,
  ready: false,
  ...more,
});
const watching = (id: string, nickname = id) => ({ id, nickname, kind: 'guest' as const });
const lobby = (more: Partial<OnlineRoom> = {}): OnlineRoom => ({
  code: 'K7QX',
  mode: '1v1',
  hostId: 'me',
  phase: 'lobby',
  quickMatch: false,
  players: [seated('me', 0)],
  spectators: [],
  ...more,
});
const mira = seated('mira', 1, { nickname: 'Mira' });

describe('roomChanges (design §13.2, Lobby)', () => {
  test('says who joined, seated or watching', () => {
    const after = lobby({ players: [seated('me', 0), mira], spectators: [watching('tal', 'Tal')] });
    expect(roomChanges(lobby(), after, 'me')).toEqual([
      { kind: 'joined', id: 'mira', nickname: 'Mira', you: false },
      { kind: 'joined', id: 'tal', nickname: 'Tal', you: false },
    ]);
  });

  test('says who left', () => {
    const before = lobby({ players: [seated('me', 0), mira] });
    expect(roomChanges(before, lobby(), 'me')).toEqual([
      { kind: 'left', id: 'mira', nickname: 'Mira', you: false },
    ]);
  });

  test('says nothing of a seat move, or of a change of ready', () => {
    const before = lobby({ players: [seated('me', 0), mira] });
    const after = lobby({ players: [seated('me', 0)], spectators: [watching('mira', 'Mira')] });
    expect(roomChanges(before, after, 'me')).toEqual([]);
    const ready = lobby({ players: [seated('me', 0), { ...mira, ready: true }] });
    expect(roomChanges(before, ready, 'me')).toEqual([]);
  });

  test('says who is host now, and whether it is you', () => {
    const before = lobby({ hostId: 'tal', players: [seated('me', 0), mira] });
    expect(roomChanges(before, { ...before, hostId: 'mira' }, 'me')).toEqual([
      { kind: 'host', id: 'mira', nickname: 'Mira', you: false },
    ]);
    expect(roomChanges(before, { ...before, hostId: 'me' }, 'me')).toEqual([
      { kind: 'host', id: 'me', nickname: 'me', you: true },
    ]);
  });

  test('says nothing of your own coming, nor between two rooms', () => {
    expect(roomChanges(null, lobby(), 'me')).toEqual([]);
    const other = lobby({ code: 'ABCD', players: [seated('me', 0), mira] });
    expect(roomChanges(lobby(), other, 'me')).toEqual([]);
  });
});

describe('lobbyRole (design §10.1: the host starts once another seated player is ready)', () => {
  test('makes the seated host wait for a player to join, then to be ready', () => {
    expect(lobbyRole(lobby(), 'me')).toEqual({ kind: 'host', canStart: false, waitingFor: 'join' });
    const joined = lobby({ players: [seated('me', 0), mira] });
    expect(lobbyRole(joined, 'me')).toEqual({ kind: 'host', canStart: false, waitingFor: 'ready' });
    const ready = lobby({ players: [seated('me', 0), { ...mira, ready: true }] });
    expect(lobbyRole(ready, 'me')).toEqual({ kind: 'host', canStart: true, waitingFor: 'ready' });
  });

  test('gives another seated player their ready, and anyone else a spectator’s role', () => {
    const room = lobby({ players: [seated('me', 0), { ...mira, ready: true }] });
    expect(lobbyRole(room, 'mira')).toEqual({ kind: 'player', ready: true });
    expect(lobbyRole(lobby({ spectators: [watching('tal')] }), 'tal')).toEqual({
      kind: 'spectator',
    });
    expect(lobbyRole(room, null)).toEqual({ kind: 'spectator' });
  });
});

test('names each room mode as both UIs show it', () => {
  expect(MODE_NAMES).toEqual({ '1v1': '1v1', ffa: 'FFA' });
});
