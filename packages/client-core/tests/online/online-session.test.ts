/// <reference types="node" />
import { ActionType, createEngine, ENGINE_VERSION, ONE_VS_ONE } from '@shura/engine';
import { PROTOCOL_VERSION } from '@shura/protocol';
import { describe, expect, test } from 'vitest';
import {
  type Connect,
  createOnlineSession,
  type Fetch,
  type OnlineSessionOptions,
  RECONNECT_BACKOFF_MS,
  RECONNECT_QUICK_MS,
  type SocketHandlers,
  type TimerClock,
} from '../../src/index';
import { fakeClock } from '../support/fake-clock';

const SESSION = { sessionId: 'me', sessionToken: 'tok', nickname: 'Or' };

interface Sent {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

/** An answer to `POST /api/sessions`, or `unreachable` for a request that gets none. */
type Answer = { status: number; body: unknown } | 'unreachable';

/** Lets the session's `POST /api/sessions` answer arrive. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A session whose `fetch` and socket the test plays the server on. */
async function session(
  answer: Answer = { status: 201, body: SESSION },
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
  // What the next POST gets: a test changes it as the server goes away and comes back.
  const answers = { next: answer };
  const fetch: Fetch = async (_url, init) => {
    posts.push(init.body === undefined ? undefined : JSON.parse(init.body));
    const next = answers.next;
    if (next === 'unreachable') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(next.body), { status: next.status });
  };
  const ticking = fakeClock(10_000);
  let timers: { at: number; callback: () => void }[] = [];
  const clock: TimerClock = {
    now: ticking.now,
    schedule: ticking.schedule,
    after: (ms, callback) => {
      const timer = { at: ticking.now() + ms, callback };
      timers.push(timer);
      return () => {
        timers = timers.filter((other) => other !== timer);
      };
    },
  };
  /** Moves time on by `ms`, firing each timer due on the way and letting any POST answer. */
  const wait = async (ms: number) => {
    const until = ticking.now() + ms;
    for (;;) {
      const due = timers.filter(({ at }) => at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((other) => other !== due);
      ticking.pass(due.at - ticking.now());
      due.callback();
      await flush();
    }
    ticking.pass(until - ticking.now());
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
    answers,
    wait,
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

  test("the roster has each player's out and place so far, then the server's places", async () => {
    const { online, say, ticking } = await welcomed();
    say('roomState', roomState('K7QX', { mode: 'ffa' }));
    say('countdown', {
      ...countdown,
      players: [...countdown.players, { id: 'third', index: 2 }],
    });
    ticking.advance(3050);
    const roster = online.getState().match?.roster;
    expect(roster).toEqual([
      { playerId: 'me', out: null, place: null },
      { playerId: 'them', out: null, place: null },
      { playerId: 'third', out: null, place: null },
    ]);
    // Frames played change the games, not the roster.
    ticking.advance(50);
    expect(online.getState().match?.roster).toBe(roster);

    say('playerOut', { playerId: 'third', reason: 'laggedOut', frame: 90 });
    say('playerOut', { playerId: 'them', reason: 'toppedOut', frame: 120 });
    expect(online.getState().match?.roster).toEqual([
      { playerId: 'me', out: null, place: null },
      { playerId: 'them', out: { reason: 'toppedOut', frame: 120 }, place: 2 },
      { playerId: 'third', out: { reason: 'laggedOut', frame: 90 }, place: 3 },
    ]);

    say('matchEnd', {
      placements: [
        { playerId: 'me', place: 1 },
        { playerId: 'them', place: 2, reason: 'toppedOut', frame: 120 },
        { playerId: 'third', place: 3, reason: 'laggedOut', frame: 90 },
      ],
      stats: [],
    });
    expect(online.getState().match?.roster.map(({ place }) => place)).toEqual([1, 2, 3]);
  });
});

describe('in the lobby (design §10.1)', () => {
  test('spectates, takes a seat and changes nickname', async () => {
    const { online, say, sent } = await welcomed();
    say('roomState', roomState('K7QX'));
    online.spectate();
    online.takeSeat();
    online.setNickname('Mira');
    expect(sent.slice(-3)).toEqual([
      { event: 'spectate', data: {} },
      { event: 'takeSeat', data: {} },
      { event: 'setNickname', data: { nickname: 'Mira' } },
    ]);
  });

  test('a rename takes the old name’s place, and your nickname is the room’s', async () => {
    const { online, say } = await welcomed();
    say('roomState', roomState('K7QX'));
    const renamed = roomState('K7QX');
    renamed.players = renamed.players.map((player) =>
      player.id === 'me' ? { ...player, nickname: 'Mira#2' } : player,
    );
    say('roomState', renamed);
    expect(online.getState().nickname).toBe('Mira#2');
    expect(online.getState().names.get('me')).toBe('Mira#2');
  });
});

describe('reconnecting (design §10.2)', () => {
  const countdown = {
    startAt: 13_000,
    seed: 7,
    matchId: 'm1',
    players: [
      { id: 'me', index: 0 },
      { id: 'them', index: 1 },
    ],
  };

  test('a dropped connection resumes the session at once: POST with the token, then hello', async () => {
    const { online, drop, posts, urls } = await welcomed();
    drop();
    expect(online.getState().connection).toEqual({ status: 'reconnecting' });
    await flush();
    expect(posts.at(-1)).toEqual({ nickname: 'Or', sessionToken: 'tok' });
    expect(urls).toHaveLength(2);
  });

  test(`retries every ${RECONNECT_QUICK_MS} ms until 3 s after the drop, then after 1 s, then every 2 s`, async () => {
    const { online, drop, posts, answers, wait } = await welcomed();
    answers.next = 'unreachable';
    drop();
    await flush();
    // The POSTs made by each moment after the drop, in 50 ms steps.
    const made: number[] = [posts.length];
    for (let ms = 0; ms < 9000; ms += 50) {
      await wait(50);
      made.push(posts.length);
    }
    const attempts = (ms: number) => (made[ms / 50] ?? 0) - 1;
    // At once, then every 250 ms up to 3 s: 13 tries. Then at 4 s, 6 s and 8 s.
    expect(attempts(0)).toBe(1);
    expect(attempts(200)).toBe(1);
    expect(attempts(250)).toBe(2);
    expect(attempts(2950)).toBe(12);
    expect(attempts(3000)).toBe(13);
    expect(attempts(3950)).toBe(13);
    expect(attempts(4000)).toBe(14);
    expect(attempts(5950)).toBe(14);
    expect(attempts(6000)).toBe(15);
    expect(attempts(8000)).toBe(16);
    expect(RECONNECT_BACKOFF_MS).toEqual([1000, 2000]);
    expect(online.getState().connection).toEqual({ status: 'reconnecting' });
  });

  test('a socket that closes again before its welcome is retried too', async () => {
    const { drop, urls, wait } = await welcomed();
    drop();
    await flush();
    drop();
    await wait(RECONNECT_QUICK_MS);
    expect(urls).toHaveLength(3);
  });

  test('back as the same session, the batches not yet acknowledged go first, in order', async () => {
    const { online, say, sent, ticking, drop, open } = await welcomed();
    say('roomState', roomState('K7QX'));
    say('countdown', countdown);
    ticking.advance(3050);
    expect(sent.filter(({ event }) => event === 'inputBatch')).toHaveLength(1);
    drop();
    await flush();
    // Played on locally meanwhile: these wait.
    ticking.advance(50);
    ticking.advance(50);
    online.setReady(false);
    expect(sent.filter(({ event }) => event === 'inputBatch')).toHaveLength(1);
    open();
    say('welcome', { sessionId: 'me', serverTime: 0 });
    const hello = sent.map(({ event }) => event).lastIndexOf('hello');
    expect(
      sent.slice(hello + 1).map(({ event, data }) => (event === 'inputBatch' ? data.seq : event)),
    ).toEqual([0, 1, 2, 'ping', 'ready']);
    expect(online.getState().connection).toEqual({ status: 'connected' });
    expect(online.getState().room?.code).toBe('K7QX');
  });

  test('back as a new session (the old one expired), the room and match are gone', async () => {
    const { online, say, ticking, drop, answers } = await welcomed();
    say('roomState', roomState('K7QX'));
    say('countdown', countdown);
    ticking.advance(3050);
    answers.next = { status: 201, body: { ...SESSION, sessionId: 'new', sessionToken: 'tok2' } };
    drop();
    await flush();
    expect(online.getState()).toMatchObject({
      sessionId: 'new',
      sessionToken: 'tok2',
      room: null,
      match: null,
    });
  });

  test('a new version while away fails the connection', async () => {
    const { online, drop, answers } = await welcomed();
    answers.next = { status: 426, body: { code: 'version_mismatch', message: 'Update.' } };
    drop();
    await flush();
    expect(online.getState().connection).toEqual({
      status: 'failed',
      reason: 'version_mismatch',
      message: 'Update.',
    });
  });

  test('closing while reconnecting stops the retries', async () => {
    const { online, drop, posts, answers, wait } = await welcomed();
    answers.next = 'unreachable';
    drop();
    await flush();
    online.close();
    const before = posts.length;
    await wait(10_000);
    expect(posts).toHaveLength(before);
    expect(online.getState().connection).toEqual({ status: 'closed' });
  });
});

describe('a snapshot (design §8.6)', () => {
  const countdown = {
    startAt: 13_000,
    seed: 7,
    matchId: 'm1',
    players: [
      { id: 'me', index: 0 },
      { id: 'them', index: 1 },
    ],
  };

  /** `them`'s game at `frame`, with a hard drop at frame 1. */
  const theirs = (frame: number) => {
    const engine = createEngine(ONE_VS_ONE, 7, 1);
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    engine.step(frame, []);
    return engine;
  };

  test('a watcher joining mid-match restores every game, then plays relays on from there', async () => {
    const { online, say, ticking } = await welcomed();
    say('roomState', roomState('K7QX', { players: [], spectators: [] }));
    say('countdown', {
      ...countdown,
      players: [
        { id: 'p2', index: 0 },
        { id: 'them', index: 1 },
      ],
    });
    say('snapshot', {
      players: [{ playerId: 'them', frame: 30, state: theirs(30).serialize() }],
    });
    const them = () => online.getState().match?.players.find(({ playerId }) => playerId === 'them');
    expect(them()?.engine.frame).toBe(30);
    expect(them()?.engine.piecesPlaced).toBe(1);
    expect(online.getState().match?.phase).toBe('playing');
    // A relay the snapshot already holds the start of plays only its later frames.
    say('relay', {
      playerId: 'them',
      frames: [
        { frame: 29, actions: [] },
        { frame: 30, actions: [] },
        { frame: 31, actions: [] },
      ],
    });
    ticking.advance(16);
    expect(them()?.engine.frame).toBe(31);
  });

  test('your own game still in plays on as it is; the countdown again changes nothing', async () => {
    const { online, say, ticking } = await welcomed();
    say('roomState', roomState('K7QX'));
    say('countdown', countdown);
    ticking.advance(3100);
    const mine = () => online.getState().match?.me?.engine.frame;
    const frame = mine();
    expect(frame).toBeGreaterThan(0);
    say('countdown', countdown);
    say('snapshot', {
      players: [
        { playerId: 'me', frame: 0, state: createEngine(ONE_VS_ONE, 7, 0).serialize() },
        { playerId: 'them', frame: 30, state: theirs(30).serialize() },
      ],
    });
    expect(mine()).toBe(frame);
  });

  test('your own game once out is the server’s copy', async () => {
    const { online, say, ticking } = await welcomed();
    say('roomState', roomState('K7QX'));
    say('countdown', countdown);
    ticking.advance(3100);
    say('playerOut', { playerId: 'me', reason: 'laggedOut', frame: 2 });
    const server = createEngine(ONE_VS_ONE, 7, 0);
    server.step(2, []);
    say('snapshot', { players: [{ playerId: 'me', frame: 2, state: server.serialize() }] });
    expect(online.getState().match?.me?.engine.frame).toBe(2);
    expect(online.getState().match?.me?.out).toEqual({ reason: 'laggedOut', frame: 2 });
  });
});
