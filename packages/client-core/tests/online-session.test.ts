import { describe, expect, test } from 'vitest';
import {
  type Connect,
  createOnlineSession,
  type SocketHandlers,
  type TimerClock,
} from '../src/index';
import { fakeClock } from './support/fake-clock';

/** A session on a socket the test plays the server on. */
function connected() {
  let server: SocketHandlers | undefined;
  const sent: { type: string }[] = [];
  const connect: Connect = (_url, handlers) => {
    server = handlers;
    return { send: (text) => sent.push(JSON.parse(text)), close: () => {} };
  };
  const ticking = fakeClock();
  const clock: TimerClock = { now: ticking.now, schedule: ticking.schedule, after: () => () => {} };
  const session = createOnlineSession({
    url: 'ws://test/ws',
    connect,
    clock,
    nickname: 'Or',
    clientVersion: 'test',
  });
  const say = (message: object) => server?.message(JSON.stringify(message));
  server?.open();
  say({ type: 'welcome', sessionId: 'me', sessionToken: 't', nickname: 'Or', serverTime: 0 });
  return { session, say, sent, ticking };
}

const roomState = (code: string) => ({
  type: 'roomState',
  code,
  mode: '1v1',
  hostId: 'me',
  phase: 'lobby',
  players: [{ id: 'me', nickname: 'Or', kind: 'guest', seat: 0, ready: false }],
  spectators: [],
});

describe('leaving a room', () => {
  test('ignores the room’s roomState still on its way', () => {
    const { session, say, sent } = connected();
    say(roomState('K7QX'));
    session.leaveRoom();
    expect(sent.at(-1)).toEqual({ type: 'leaveRoom' });
    expect(session.getState().room).toBeNull();
    say(roomState('K7QX'));
    expect(session.getState().room).toBeNull();
  });

  test('takes the room again once you join it again, and other rooms at once', () => {
    const { session, say } = connected();
    say(roomState('K7QX'));
    session.leaveRoom();
    say(roomState('ABCD'));
    expect(session.getState().room?.code).toBe('ABCD');
    session.leaveRoom();
    session.joinRoom('K7QX');
    say(roomState('K7QX'));
    expect(session.getState().room?.code).toBe('K7QX');
  });
});

describe('garbage routings (design §8.5: the attack streak)', () => {
  const countdown = {
    type: 'countdown',
    startAt: 3_000,
    seed: 7,
    matchId: 'm',
    players: [
      { id: 'me', index: 0 },
      { id: 'them', index: 1 },
      { id: 'cy', index: 2 },
    ],
  };
  const routing = { id: 1, from: 'them', to: 'cy', lines: 2, holeSeed: 9 };

  test('passes every routing of the match on, whoever it was aimed at', () => {
    const { session, say } = connected();
    say(roomState('K7QX'));
    say(countdown);
    const heard: object[] = [];
    session.onRoutings((heardRouting) => heard.push(heardRouting));
    say({ type: 'garbageQueued', ...routing });
    say({ type: 'garbageQueued', ...routing, id: 2, from: 'cy', to: 'me' });
    expect(heard).toEqual([routing, { ...routing, id: 2, from: 'cy', to: 'me' }]);
  });

  test('passes on none outside a match, and none once the listener is removed', () => {
    const { session, say } = connected();
    say(roomState('K7QX'));
    const heard: object[] = [];
    const stop = session.onRoutings((heardRouting) => heard.push(heardRouting));
    say({ type: 'garbageQueued', ...routing });
    say(countdown);
    stop();
    say({ type: 'garbageQueued', ...routing });
    expect(heard).toEqual([]);
  });
});

test('tells the time on its clock, which key events are stamped with', () => {
  const { session, ticking } = connected();
  const before = session.now();
  ticking.pass(250);
  expect(session.now()).toBe(before + 250);
});
