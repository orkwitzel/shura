import { describe, expect, test } from 'vitest';
import type { GatewayLimits } from '../../src/limits';
import { onlineWorld } from '../support/online-world';
import { type RawClient, rawClient } from '../support/raw-client';

const IP = '203.0.113.7';
const OTHER_IP = '198.51.100.1';
const LOCALHOST = '127.0.0.1';

/** A world whose gateway has `limits`, and bare clients of it. */
async function world(limits: Partial<GatewayLimits> = {}) {
  const online = await onlineWorld({ limits });
  /** A client from `ip`, said hello, with its welcome in. */
  const connected = async (ip = IP, nickname = 'Ada'): Promise<RawClient> => {
    const client = rawClient(online.gateway, ip);
    client.hello(nickname);
    await online.time.settle();
    return client;
  };
  /** A room `host` created, by its code. */
  const createRoom = async (host: RawClient): Promise<string> => {
    host.send({ type: 'createRoom', mode: '1v1' });
    await online.time.settle();
    const state = host.received.findLast((message) => message.type === 'roomState');
    if (state?.type !== 'roomState') throw new Error('no room');
    return state.code;
  };
  return { ...online, connected, createRoom };
}

const welcomed = (client: RawClient) => client.received.some(({ type }) => type === 'welcome');

describe('per connection (design §11)', () => {
  test('3 invalid messages close the connection, each answered invalid_message', async () => {
    const { time, connected } = await world();
    const client = await connected();
    client.send('not json');
    client.send({ type: 'nope' });
    await time.settle();
    expect(client.errors()).toEqual(['invalid_message', 'invalid_message']);
    expect(client.closed).toBe(false);
    client.send({ type: 'ping' });
    await time.settle();
    expect(client.errors()).toEqual(['invalid_message', 'invalid_message', 'invalid_message']);
    expect(client.closed).toBe(true);
  });

  test('the message bucket answers rate_limited once, drops the rest, and refills', async () => {
    const { time, connected } = await world({ messagesPerSecond: 2, messageBurst: 3 });
    const client = await connected(); // The hello took one token.
    for (let id = 0; id < 5; id++) client.send({ type: 'ping', id });
    await time.settle();
    const pongs = () => client.received.filter(({ type }) => type === 'pong').length;
    expect(pongs()).toBe(2);
    expect(client.errors()).toEqual(['rate_limited']);
    await time.advance(500);
    client.send({ type: 'ping', id: 9 });
    await time.settle();
    expect(pongs()).toBe(3);
    expect(client.closed).toBe(false);
  });

  test('an exempt IP still trips the message bucket', async () => {
    const { time, connected } = await world({
      messagesPerSecond: 1,
      messageBurst: 2,
      exemptIps: [LOCALHOST],
    });
    const client = await connected(LOCALHOST);
    for (let id = 0; id < 3; id++) client.send({ type: 'ping', id });
    await time.settle();
    expect(client.errors()).toEqual(['rate_limited']);
  });
});

describe('per IP (design §11)', () => {
  test('concurrent connections are capped per IP, and a closed one frees its place', async () => {
    const { time, connected } = await world({ connectionsPerIp: 2 });
    const first = await connected();
    await connected();
    const third = await connected();
    expect(third.errors()).toEqual(['too_many_connections']);
    expect(third.closed).toBe(true);
    expect(welcomed(third)).toBe(false);
    expect(welcomed(await connected(OTHER_IP))).toBe(true);
    first.close();
    await time.settle();
    expect(welcomed(await connected())).toBe(true);
  });

  test('an online session refused at the door says so in plain words', async () => {
    // Online sessions in the world connect from 127.0.0.1.
    const online = await world({ connectionsPerIp: 0 });
    const ada = online.client('Ada');
    await online.time.settle();
    expect(ada.getState().connection).toEqual({
      status: 'failed',
      reason: 'too_many_connections',
      message: 'Too many connections from your network. Try again in a minute.',
    });
  });

  test('a long connection still counts once its count would have expired', async () => {
    const { time, connected } = await world({ connectionsPerIp: 1 });
    await connected();
    await time.advance(60 * 60_000);
    expect((await connected()).errors()).toEqual(['too_many_connections']);
  });

  test('new connections are capped per IP per minute', async () => {
    const { time, connected } = await world({ newConnectionsPerIpPerMinute: 2 });
    (await connected()).close();
    (await connected()).close();
    const third = await connected();
    expect(third.errors()).toEqual(['too_many_connections']);
    await time.advance(30_000);
    expect(welcomed(await connected())).toBe(true);
  });

  test('an exempt IP is not capped on connections', async () => {
    const { connected } = await world({
      connectionsPerIp: 1,
      newConnectionsPerIpPerMinute: 1,
      exemptIps: [LOCALHOST, '::1'],
    });
    const clients = [];
    for (let i = 0; i < 4; i++) clients.push(await connected(LOCALHOST));
    expect(clients.map(welcomed)).toEqual([true, true, true, true]);
    expect((await connected('::ffff:127.0.0.1')).errors()).toEqual([]);
  });

  test('rooms created are capped per IP per minute, with room_limit', async () => {
    const { time, connected, createRoom } = await world({ roomsPerIpPerMinute: 1 });
    await createRoom(await connected(IP, 'Ada'));
    const bo = await connected(IP, 'Bo');
    bo.send({ type: 'createRoom', mode: '1v1' });
    await time.settle();
    expect(bo.errors()).toEqual(['room_limit']);
    await createRoom(await connected(OTHER_IP, 'Cy'));
    await time.advance(60_000);
    expect(await createRoom(bo)).toMatch(/^[2-9A-HJKMNP-Z]{4}$/);
  });

  test('an exempt IP is not capped on rooms', async () => {
    const { connected, createRoom } = await world({
      roomsPerIpPerMinute: 1,
      exemptIps: [LOCALHOST],
    });
    for (const name of ['Ada', 'Bo', 'Cy']) await createRoom(await connected(LOCALHOST, name));
  });

  test('failed joins are capped per IP per minute, then even a real code is refused', async () => {
    const { time, connected, createRoom } = await world({ failedJoinsPerIpPerMinute: 2 });
    const code = await createRoom(await connected(OTHER_IP, 'Ada'));
    const guesser = await connected(IP, 'Bo');
    for (const guess of ['ZZZZ', 'YYYY', code]) guesser.send({ type: 'joinRoom', code: guess });
    await time.settle();
    expect(guesser.errors()).toEqual(['room_not_found', 'room_not_found', 'rate_limited']);
    await time.advance(60_000);
    guesser.send({ type: 'joinRoom', code });
    await time.settle();
    expect(guesser.received.at(-1)).toMatchObject({ type: 'roomState', code });
  });

  test('joins that find their room are not counted as failed', async () => {
    const { time, connected, createRoom } = await world({ failedJoinsPerIpPerMinute: 1 });
    const code = await createRoom(await connected(OTHER_IP, 'Ada'));
    const bo = await connected(IP, 'Bo');
    for (let i = 0; i < 3; i++) {
      bo.send({ type: 'joinRoom', code });
      await time.settle();
      bo.send({ type: 'leaveRoom' });
      await time.settle();
    }
    expect(bo.errors()).toEqual([]);
  });

  test('an exempt IP is not capped on failed joins', async () => {
    const { time, connected } = await world({
      failedJoinsPerIpPerMinute: 1,
      exemptIps: [LOCALHOST],
    });
    const guesser = await connected(LOCALHOST);
    for (const guess of ['ZZZZ', 'YYYY', 'XXXX']) guesser.send({ type: 'joinRoom', code: guess });
    await time.settle();
    expect(guesser.errors()).toEqual(['room_not_found', 'room_not_found', 'room_not_found']);
  });
});

describe('per session and per room (design §11)', () => {
  test('a session hosts one room at a time, with room_limit', async () => {
    const { time, connected, createRoom } = await world({ exemptIps: [IP] });
    const ada = await connected();
    await createRoom(ada);
    ada.send({ type: 'createRoom', mode: 'ffa' });
    await time.settle();
    expect(ada.errors()).toEqual(['room_limit']);
    ada.send({ type: 'leaveRoom' });
    await time.settle();
    await createRoom(ada);
  });

  test('a player in a room they do not host is told to leave it first', async () => {
    const { time, connected, createRoom } = await world();
    const code = await createRoom(await connected(IP, 'Ada'));
    const bo = await connected(OTHER_IP, 'Bo');
    bo.send({ type: 'joinRoom', code });
    bo.send({ type: 'createRoom', mode: '1v1' });
    await time.settle();
    expect(bo.errors()).toEqual(['wrong_phase']);
  });

  test('a session that left the quick-match queue waits out the cooldown, with rate_limited', async () => {
    const { time, connected } = await world({ quickMatchCooldownMs: 500 });
    const ada = await connected();
    ada.send({ type: 'quickMatch' });
    ada.send({ type: 'cancelQuickMatch' });
    ada.send({ type: 'quickMatch' });
    await time.settle();
    expect(ada.errors()).toEqual(['rate_limited']);
    await time.advance(500);
    ada.send({ type: 'quickMatch' });
    await time.settle();
    expect(ada.errors()).toEqual(['rate_limited']);
    expect(ada.received.at(-1)).toMatchObject({ type: 'quickMatchQueued' });
  });

  test('MAX_SPECTATORS caps a room’s spectators, with room_full', async () => {
    const { time, connected, createRoom } = await world({ maxSpectators: 1 });
    const code = await createRoom(await connected(IP, 'Ada'));
    const others = [];
    for (const name of ['Bo', 'Cy', 'Di']) {
      const other = await connected(OTHER_IP, name);
      other.send({ type: 'joinRoom', code });
      await time.settle();
      others.push(other);
    }
    expect(others.map((other) => other.errors())).toEqual([[], [], ['room_full']]);
  });
});
