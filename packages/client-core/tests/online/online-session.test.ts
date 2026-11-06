/// <reference types="node" />
import { ActionType, ENGINE_VERSION } from '@shura/engine';
import { PROTOCOL_VERSION } from '@shura/protocol';
import { describe, expect, test } from 'vitest';
import {
  type Connect,
  createOnlineSession,
  type Fetch,
  type OnlineSessionOptions,
  type SocketHandlers,
  type TimerClock,
} from '../../src/index';
import { fakeClock } from '../support/fake-clock';

const SESSION = { sessionId: 'me', sessionToken: 'tok', nickname: 'Or' };

interface Sent {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

/** Lets the session's `POST /api/sessions` answer arrive. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A session whose `fetch` and socket the test plays the server on. */
async function session(
  answer: { status: number; body: unknown } = { status: 201, body: SESSION },
  options: Partial<OnlineSessionOptions> = {},
) {
  let server: SocketHandlers | undefined;
  const urls: string[] = [];
  const sent: Sent[] = [];
  let closed = false;
  const connect: Connect = (url, handlers) => {
    urls.push(url);
    server = handlers;
    return {
      send: (text) => sent.push(JSON.parse(text)),
      close: () => {
        closed = true;
      },
    };
  };
  const posts: unknown[] = [];
  const fetch: Fetch = async (_url, init) => {
    posts.push(init.body === undefined ? undefined : JSON.parse(init.body));
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  };
  const ticking = fakeClock(10_000);
  const timers: { at: number; callback: () => void }[] = [];
  const clock: TimerClock = {
    now: ticking.now,
    schedule: ticking.schedule,
    after: (ms, callback) => {
      const timer = { at: ticking.now() + ms, callback };
      timers.push(timer);
      return () => timers.splice(timers.indexOf(timer), 1);
    },
  };
  const online = createOnlineSession({
    serverUrl: 'http://localhost:8080',
    connect,
    fetch,
    clock,
    nickname: 'Or',
    clientVersion: 'test',
    ...options,
  });
  await flush();
  const say = (event: string, data: object = {}) =>
    server?.message(JSON.stringify({ event, data }));
  return {
    online,
    say,
    sent,
    urls,
    posts,
    ticking,
    open: () => server?.open(),
    drop: () => server?.close(),
    closed: () => closed,
  };
}

/** A session that has said hello and been welcomed. */
async function welcomed() {
  const world = await session();
  world.open();
  world.say('welcome', { sessionId: 'me', serverTime: 0 });
  return world;
}

const roomState = (code: string, extra: object = {}) => ({
  code,
  mode: '1v1',
  hostId: 'me',
  phase: 'lobby',
  players: [
    { id: 'me', nickname: 'Or', kind: 'guest', seat: 0, ready: false },
    { id: 'them', nickname: 'Mira', kind: 'guest', seat: 1, ready: true },
  ],
  spectators: [],
  ...extra,
});

describe('connecting (design §13.1)', () => {
  test('creates the session over HTTP, then says hello on /ws with its token', async () => {
    const { online, posts, urls, sent, open } = await session();
    expect(posts).toEqual([{ nickname: 'Or' }]);
    expect(urls).toEqual(['ws://localhost:8080/ws']);
    expect(online.getState()).toMatchObject({
      connection: { status: 'connecting' },
      sessionId: 'me',
      sessionToken: 'tok',
      nickname: 'Or',
    });
    open();
    expect(sent).toEqual([
      {
        event: 'hello',
        data: {
          protocolVersion: PROTOCOL_VERSION,
          engineVersion: ENGINE_VERSION,
          clientVersion: 'test',
          sessionToken: 'tok',
        },
      },
    ]);
  });

  test('resumes the session a token names', async () => {
    const { posts } = await session(undefined, { sessionToken: 'old' });
    expect(posts).toEqual([{ nickname: 'Or', sessionToken: 'old' }]);
  });

  test('is connected once welcomed, and pings for the clock offset', async () => {
    const { online, sent } = await welcomed();
    expect(online.getState().connection).toEqual({ status: 'connected' });
    expect(sent.at(-1)).toEqual({ event: 'ping', data: { id: 0 } });
  });

  test('a refused POST fails the connection with its code, and opens no socket', async () => {
    const { online, urls } = await session({
      status: 426,
      body: { code: 'version_mismatch', message: 'Update.' },
    });
    expect(online.getState().connection).toEqual({
      status: 'failed',
      reason: 'version_mismatch',
      message: 'Update.',
    });
    expect(urls).toEqual([]);
  });

  test('an exception before the welcome is why the connection failed', async () => {
    const { online, open, say, drop } = await session();
    open();
    say('exception', { code: 'version_mismatch', message: 'Update.' });
    drop();
    expect(online.getState().connection).toEqual({
      status: 'failed',
      reason: 'version_mismatch',
      message: 'Update.',
    });
  });

  test('a socket that never opens is `unreachable`', async () => {
    const { online, drop } = await session();
    drop();
    expect(online.getState().connection).toMatchObject({ status: 'failed', reason: 'unreachable' });
  });

  test('room actions wait for the welcome, then go in order', async () => {
    const { online, open, say, sent } = await session();
    online.createRoom('1v1');
    open();
    expect(sent.map(({ event }) => event)).toEqual(['hello']);
    say('welcome', { sessionId: 'me', serverTime: 0 });
    expect(sent.map(({ event }) => event)).toEqual(['hello', 'ping', 'createRoom']);
  });
});

describe('the room', () => {
  test('takes each roomState, and every name in it', async () => {
    const { online, say } = await welcomed();
    say('roomState', roomState('K7QX'));
    expect(online.getState().room).toMatchObject({ code: 'K7QX', quickMatch: false });
    expect(online.getState().names.get('them')).toBe('Mira');
  });

  test('ignores the roomState of a room just left, still on its way', async () => {
    const { online, say, sent } = await welcomed();
    say('roomState', roomState('K7QX'));
    online.leaveRoom();
    expect(sent.at(-1)).toEqual({ event: 'leaveRoom', data: {} });
    say('roomState', roomState('K7QX'));
    expect(online.getState().room).toBeNull();
    online.joinRoom('K7QX');
    say('roomState', roomState('K7QX'));
    expect(online.getState().room?.code).toBe('K7QX');
  });

  test('keeps an exception after the welcome for the UI', async () => {
    const { online, say } = await welcomed();
    say('exception', { code: 'not_host', message: 'Only the host can do that.' });
    expect(online.getState().error).toEqual({
      code: 'not_host',
      message: 'Only the host can do that.',
    });
    expect(online.getState().connection).toEqual({ status: 'connected' });
  });

  test('closing leaves the room first', async () => {
    const { online, say, sent, closed } = await welcomed();
    say('roomState', roomState('K7QX'));
    online.close();
    expect(sent.at(-1)).toEqual({ event: 'leaveRoom', data: {} });
    expect(closed()).toBe(true);
    expect(online.getState().connection).toEqual({ status: 'closed' });
  });
});

describe('quick-match (design §9.4)', () => {
  test('queues, and is back to idle once cancelled', async () => {
    const { online, say, sent } = await welcomed();
    expect(online.getState().quickMatch).toBe('idle');
    online.quickMatch();
    expect(sent.at(-1)).toEqual({ event: 'quickMatch', data: {} });
    say('quickMatchQueued');
    expect(online.getState().quickMatch).toBe('queued');
    online.cancelQuickMatch();
    expect(sent.at(-1)).toEqual({ event: 'cancelQuickMatch', data: {} });
    say('quickMatchCancelled');
    expect(online.getState().quickMatch).toBe('idle');
  });

  test('a quick-match room ends the wait, and says it is one', async () => {
    const { online, say } = await welcomed();
    online.quickMatch();
    say('quickMatchQueued');
    say('roomState', roomState('K7QX', { hostId: undefined, quickMatch: true }));
    expect(online.getState().quickMatch).toBe('idle');
    expect(online.getState().room).toMatchObject({ code: 'K7QX', quickMatch: true });
    expect(online.getState().room?.hostId).toBeUndefined();
  });

  test('asks for a rematch', async () => {
    const { online, say, sent } = await welcomed();
    say('roomState', roomState('K7QX', { hostId: undefined, quickMatch: true }));
    online.rematch();
    expect(sent.at(-1)).toEqual({ event: 'rematch', data: {} });
  });

  test('opponentLeft takes you out of the room, keeping the last match for its results', async () => {
    const { online, say, ticking } = await welcomed();
    say('roomState', roomState('K7QX', { hostId: undefined, quickMatch: true }));
    say('countdown', {
      startAt: 13_000,
      seed: 7,
      matchId: 'm1',
      players: [
        { id: 'me', index: 0 },
        { id: 'them', index: 1 },
      ],
    });
    ticking.advance(3050);
    say('matchEnd', { placements: [{ playerId: 'me', place: 1 }], stats: [] });
    say('opponentLeft');
    expect(online.getState().quickMatch).toBe('opponentLeft');
    expect(online.getState().room).toBeNull();
    expect(online.getState().match).toMatchObject({ phase: 'ended', matchId: 'm1' });

    online.quickMatch();
    say('quickMatchQueued');
    expect(online.getState().quickMatch).toBe('queued');
  });
});

describe('a match', () => {
  const countdown = {
    startAt: 13_000,
    seed: 7,
    matchId: 'm1',
    players: [
      { id: 'me', index: 0 },
      { id: 'them', index: 1 },
    ],
  };

  test('counts down from startAt, then sends input batches every 3 frames', async () => {
    const { online, say, sent, ticking } = await welcomed();
    say('roomState', roomState('K7QX'));
    say('countdown', countdown);
    expect(online.getState().match).toMatchObject({ phase: 'countdown', matchId: 'm1' });
    ticking.advance(3000);
    expect(online.getState().match?.phase).toBe('playing');
    online.act(ActionType.HardDrop, online.now());
    ticking.advance(50);
    const batch = sent.find(({ event }) => event === 'inputBatch');
    expect(batch?.data).toEqual({
      seq: 0,
      frames: [
        { frame: 1, actions: [{ frame: 1, type: ActionType.HardDrop }] },
        { frame: 2, actions: [] },
        { frame: 3, actions: [] },
      ],
    });
  });

  test("plays the opponent's relayed frames on their own engine", async () => {
    const { online, say, ticking } = await welcomed();
    say('roomState', roomState('K7QX'));
    say('countdown', countdown);
    ticking.advance(3050);
    say('relay', {
      playerId: 'them',
      frames: [
        { frame: 1, actions: [{ frame: 1, type: ActionType.HardDrop }] },
        { frame: 2, actions: [] },
      ],
    });
    ticking.advance(16);
    const them = online.getState().match?.players.find(({ playerId }) => playerId === 'them');
    expect(them?.engine.frame).toBe(2);
    expect(them?.engine.piecesPlaced).toBe(1);
  });

  test('ends with the placements', async () => {
    const { online, say, ticking } = await welcomed();
    say('roomState', roomState('K7QX'));
    say('countdown', countdown);
    ticking.advance(3050);
    say('playerOut', { playerId: 'them', reason: 'toppedOut', frame: 2 });
    const result = {
      placements: [
        { playerId: 'me', place: 1 },
        { playerId: 'them', place: 2, reason: 'toppedOut', frame: 2 },
      ],
      stats: [],
    };
    say('matchEnd', result);
    expect(online.getState().match).toMatchObject({ phase: 'ended', result });
  });
});
