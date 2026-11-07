import { COUNTDOWN_MS, SEAT_HOLD_MS } from '@shura/protocol';
import { describe, expect, test } from 'vitest';
import { type TestRoom, testRoom } from '../support/test-room';

/** A room with `ids` joined in order, the first its host. */
function roomOf(ids: readonly string[], options: Parameters<typeof testRoom>[0] = {}): TestRoom {
  const test = testRoom({ hostId: ids[0], ...options });
  for (const id of ids) test.join(id);
  return test;
}

/** `ready` ready up, and the host starts. */
function start(test: TestRoom, host: string, ...ready: string[]): void {
  for (const id of ready) test.room.ready(id, { ready: true });
  test.room.start(host);
}

describe('seats (design §10.1)', () => {
  test('a full 1v1 room makes spectators, who take freed seats at the next lobby in arrival order', () => {
    const test = roomOf(['a', 'b', 'c', 'd']);
    expect(test.seats()).toEqual({ players: ['a', 'b'], spectators: ['c', 'd'] });

    start(test, 'a', 'b');
    // Nobody takes a seat during a match.
    test.room.takeSeat('c');
    expect(test.to('c', 'exception').at(-1)?.data).toMatchObject({ code: 'wrong_phase' });

    // Bo leaves: Ada wins, and the room is back in the lobby.
    test.room.leave('b');
    expect(test.lastState()?.phase).toBe('lobby');
    expect(test.seats()).toEqual({ players: ['a', 'c'], spectators: ['d'] });
  });

  test('the spectator after the most a room holds gets room_full', () => {
    const test = roomOf(['a', 'b'], { maxSpectators: 16 });
    for (let n = 0; n < 16; n++) test.join(`w${n}`);
    test.join('late');
    expect(test.seats().spectators).toHaveLength(16);
    expect(test.to('late')).toEqual([
      { event: 'exception', data: { code: 'room_full', message: 'That room is full.' } },
    ]);
    expect(test.summary()).toMatchObject({ seated: 2, spectators: 16 });
  });

  test('a seated player who isn’t ready sits the match out and watches; an FFA starts with 2', () => {
    const test = roomOf(['a', 'b', 'c'], { mode: 'ffa' });
    start(test, 'a', 'b');
    const countdown = test.to('c', 'countdown')[0];
    expect(countdown?.data).toMatchObject({
      players: [
        { id: 'a', index: 0 },
        { id: 'b', index: 1 },
      ],
    });
    expect(test.seats().players).toEqual(['a', 'b', 'c']);
  });

  test('in the lobby, spectate steps out of a seat and takeSeat takes a free one', () => {
    const test = roomOf(['a', 'b', 'c']);
    test.room.takeSeat('c');
    expect(test.to('c', 'exception').map(({ data }) => data)).toEqual([
      { code: 'no_free_seat', message: 'Every seat is taken.' },
    ]);
    test.room.spectate('b');
    // Spectators are listed in the order they came to the room.
    expect(test.seats()).toEqual({ players: ['a'], spectators: ['b', 'c'] });
    test.room.takeSeat('c');
    expect(test.seats()).toEqual({ players: ['a', 'c'], spectators: ['b'] });
  });

  test('a player who stepped out to watch isn’t seated again at the next lobby', () => {
    const test = roomOf(['a', 'b', 'c']);
    test.room.spectate('c');
    test.room.spectate('b');
    test.room.takeSeat('c');
    start(test, 'a', 'c');
    test.room.leave('c');
    expect(test.lastState()?.phase).toBe('lobby');
    expect(test.seats()).toEqual({ players: ['a'], spectators: ['b'] });
  });

  test('seats and nicknames don’t move once the match is counting down', () => {
    const test = roomOf(['a', 'b', 'c']);
    start(test, 'a', 'b');
    test.room.spectate('b');
    test.room.setNickname('c', { nickname: 'Zed' });
    expect(test.errorsTo('b')).toEqual(['Seats move in the lobby.']);
    expect(test.errorsTo('c')).toEqual(['Nicknames change in the lobby.']);
  });
});

describe('nicknames (design §10.2)', () => {
  test('a new nickname in the lobby, with #2 if another member has it', () => {
    const test = roomOf(['a', 'b']);
    test.room.setNickname('b', { nickname: 'a' });
    expect(test.lastState()?.players.map(({ nickname }) => nickname)).toEqual(['a', 'a#2']);
    // Renaming to your own name keeps it as it is.
    test.room.setNickname('b', { nickname: 'a#2' });
    expect(test.lastState()?.players.map(({ nickname }) => nickname)).toEqual(['a', 'a#2']);
  });
});

describe('holding a place (design §10.2)', () => {
  test('a lobby seat is held for 30 s after a disconnect, then freed', () => {
    const test = roomOf(['a', 'b']);
    test.drop('b');
    test.advance(SEAT_HOLD_MS - 1);
    expect(test.seats().players).toEqual(['a', 'b']);
    test.advance(1);
    expect(test.seats().players).toEqual(['a']);
  });

  test('back within the hold, a member has the same seat, nickname and ready', () => {
    const test = roomOf(['a', 'b']);
    test.join('c', { nickname: 'a' });
    test.room.spectate('b');
    test.room.takeSeat('c');
    test.room.ready('c', { ready: true });
    test.drop('c');
    test.advance(10_000);
    test.join('c', { nickname: 'a', link: 'other' });
    test.advance(SEAT_HOLD_MS);
    expect(test.lastState()?.players).toEqual([
      expect.objectContaining({ id: 'a', nickname: 'a', seat: 0 }),
      expect.objectContaining({ id: 'c', nickname: 'a#2', seat: 1, ready: true }),
    ]);
  });

  test('a connection that closed after the member came back through another changes nothing', () => {
    const test = roomOf(['a', 'b']);
    test.join('b', { link: 'other' });
    test.drop('b', 'main');
    test.advance(SEAT_HOLD_MS);
    expect(test.seats().players).toEqual(['a', 'b']);
    test.room.ready('b', { ready: true });
    expect(test.sent.at(-1)).toMatchObject({ to: 'b', link: 'other' });
  });

  test('nothing is sent to a member while they’re away', () => {
    const test = roomOf(['a', 'b']);
    test.drop('b');
    const before = test.to('b').length;
    test.room.ready('a', { ready: false });
    expect(test.to('b')).toHaveLength(before);
  });

  test('the host’s role goes to the member there longest who is still connected', () => {
    const test = roomOf(['a', 'b', 'c']);
    test.drop('b');
    test.room.leave('a');
    expect(test.lastState()?.hostId).toBe('c');
  });

  test('a host who only disconnected stays host while their seat is held', () => {
    const test = roomOf(['a', 'b']);
    test.drop('a');
    test.room.ready('b', { ready: true });
    expect(test.lastState()?.hostId).toBe('a');
    test.advance(SEAT_HOLD_MS);
    expect(test.lastState()?.hostId).toBe('b');
  });

  test('a room that emptied gives the host to the first to join it again', () => {
    const test = roomOf(['a']);
    test.room.leave('a');
    expect(test.emptied()).toBe(1);
    test.join('b');
    expect(test.lastState()?.hostId).toBe('b');
    expect(test.summary()?.hostId).toBe('b');
  });

  test('a player who drops mid-match is held until it ends, then for 30 s', () => {
    const test = roomOf(['a', 'b', 'c'], { mode: 'ffa' });
    start(test, 'a', 'b', 'c');
    test.drop('b');
    test.advance(1000);
    // c and a leave: b, still in, wins, and the match ends. Their hold starts only now.
    test.room.leave('c');
    test.room.leave('a');
    expect(test.summary()?.phase).toBe('lobby');
    test.advance(SEAT_HOLD_MS - 1);
    expect(test.room.empty).toBe(false);
    test.advance(1);
    expect(test.room.empty).toBe(true);
  });
});

describe('catching up (design §8.6)', () => {
  test('a late joiner gets the countdown, who is out, then a snapshot of every game', () => {
    const test = roomOf(['a', 'b', 'c'], { mode: 'ffa' });
    start(test, 'a', 'b', 'c');
    test.advance(COUNTDOWN_MS + 500);
    test.room.leave('c');
    test.join('d');
    const events = test.to('d').map(({ event }) => event);
    expect(events).toEqual(['roomState', 'countdown', 'playerOut', 'snapshot']);
    const snapshot = test.to('d', 'snapshot')[0];
    expect(snapshot?.event === 'snapshot' && snapshot.data.players.map((p) => p.playerId)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(test.seats().spectators).toEqual(['d']);
  });

  test('a player back mid-match gets the countdown again and a snapshot', () => {
    const test = roomOf(['a', 'b']);
    start(test, 'a', 'b');
    test.drop('b');
    test.advance(COUNTDOWN_MS + 500);
    const before = test.to('b').length;
    test.join('b');
    expect(
      test
        .to('b')
        .slice(before)
        .map(({ event }) => event),
    ).toEqual(['roomState', 'countdown', 'snapshot']);
  });

  test('a player away when the match ended gets its result after the final boards', () => {
    const test = roomOf(['a', 'b', 'c'], { mode: 'ffa' });
    start(test, 'a', 'b', 'c');
    test.advance(COUNTDOWN_MS + 500);
    test.drop('b');
    test.room.leave('c');
    test.room.leave('a');
    const before = test.to('b').length;
    test.join('b');
    expect(
      test
        .to('b')
        .slice(before)
        .map(({ event }) => event),
    ).toEqual(['roomState', 'countdown', 'playerOut', 'playerOut', 'snapshot', 'matchEnd']);
    // Only once.
    test.drop('b');
    test.join('b');
    expect(test.to('b', 'matchEnd')).toHaveLength(1);
  });
});
