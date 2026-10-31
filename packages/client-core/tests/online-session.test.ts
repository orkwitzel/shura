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
  const clock: TimerClock = { ...fakeClock(), after: () => () => {} };
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
  return { session, say, sent };
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
