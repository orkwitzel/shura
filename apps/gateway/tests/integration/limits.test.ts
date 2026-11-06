import { errorText } from '@shura/client-core';
import { afterEach, describe, expect, test } from 'vitest';
import { VERSION_HEADERS } from '../support/api';
import { connected, eventually, openRoom } from '../support/online-games';
import { type OnlineWorld, type OnlineWorldOptions, onlineWorld } from '../support/online-world';
import { type RawClient, rawClient } from '../support/raw-client';

// The abuse limits (design §11), tripped one by one over real sockets and `fetch`. Every client of
// a test comes from loopback, so a test of the per-IP limits trusts loopback as a proxy and gives
// each client its address in `X-Forwarded-For`.

const LOOPBACK = ['127.0.0.1', '::1'];
const MINUTE = 60_000;

let world: OnlineWorld;
const clients: RawClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await world.close();
});

/** A world whose per-IP limits apply to the address each client names in `X-Forwarded-For`. */
const behindProxy = (limits: OnlineWorldOptions['limits'] = {}) =>
  onlineWorld({ limits: { trustedProxies: LOOPBACK, ...limits } });

/** A raw client, from `ip` if given (through the trusted proxy), once the server has settled. */
const raw = async (ip?: string): Promise<RawClient> => {
  const client = await rawClient(world.serverUrl, ip ? { 'x-forwarded-for': ip } : {});
  clients.push(client);
  await world.time.settle();
  return client;
};

/** A raw client from `ip` that has said hello and been welcomed. */
const welcomed = async (ip?: string): Promise<RawClient> => {
  const client = await raw(ip);
  await client.hello();
  await eventually(
    world,
    () => client.received.some(({ event }) => event === 'welcome'),
    'the welcome',
  );
  return client;
};

const send = async (client: RawClient, message: object | string) => {
  client.send(message);
  await world.time.settle();
};

const events = (client: RawClient) => client.received.map(({ event }) => event);

/** The code of the room the client is in, from its last `roomState`. */
const roomCodeOf = (client: RawClient): string => {
  const state = client.received.findLast((message) => message.event === 'roomState');
  if (state?.event !== 'roomState') throw new Error('not in a room');
  return state.data.code;
};

const lookup = (code: string, ip: string) =>
  fetch(`${world.serverUrl}/api/rooms/${code}`, {
    headers: { ...VERSION_HEADERS, 'x-forwarded-for': ip },
  });

const postSession = (ip: string) =>
  fetch(`${world.serverUrl}/api/sessions`, {
    method: 'POST',
    headers: { ...VERSION_HEADERS, 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ nickname: 'Ada' }),
  });

describe('per connection', () => {
  test('each invalid message gets invalid_message, and the third closes the connection', async () => {
    world = await onlineWorld();
    const client = await welcomed();
    await send(client, 'not json');
    await send(client, { event: 'noSuchMessage', data: {} });
    expect(client.exceptions()).toEqual(['invalid_message', 'invalid_message']);
    expect(client.closed).toBe(false);

    await send(client, { event: 'ping', data: { id: 'not a number' } });
    expect(client.exceptions()).toEqual(['invalid_message', 'invalid_message', 'invalid_message']);
    expect(client.closed).toBe(true);
  });

  test('valid messages in between don’t reset the invalid count', async () => {
    world = await onlineWorld({ limits: { invalidMessagesBeforeDisconnect: 2 } });
    const client = await welcomed();
    await send(client, '{');
    await send(client, { event: 'ping', data: { id: 1 } });
    expect(client.closed).toBe(false);
    await send(client, [1, 2]);
    expect(client.closed).toBe(true);
  });

  test('the message bucket answers rate_limited once, drops the rest, then refills', async () => {
    // Loopback is exempt here (as in `pnpm dev`): the per-connection bucket still applies.
    world = await onlineWorld({ limits: { messageBurst: 5, messagesPerSecond: 2 } });
    const client = await welcomed();
    const before = events(client).length;
    for (let id = 0; id < 8; id++) client.send({ event: 'ping', data: { id } });
    await world.time.settle();
    // hello took a token: 4 pongs, one refusal, and silence.
    expect(events(client).slice(before)).toEqual(['pong', 'pong', 'pong', 'pong', 'exception']);
    expect(client.exceptions()).toEqual(['rate_limited']);

    await world.time.advance(500);
    await send(client, { event: 'ping', data: { id: 9 } });
    expect(events(client).at(-1)).toBe('pong');
    expect(client.closed).toBe(false);
  });

  test('a message over the size limit closes the connection with 1009', async () => {
    world = await onlineWorld({ limits: { maxPayloadBytes: 1024 } });
    const client = await welcomed();
    await send(client, { event: 'ping', data: { id: 1, padding: 'x'.repeat(2000) } });
    // The raw client's close isn't counted as traffic, so under load it can land after `settle()`.
    await eventually(world, () => client.closed, 'the close');
    expect(client.closeCode).toBe(1009);
  });
});

describe('per IP', () => {
  test('concurrent connections are capped, and a closed one frees its place', async () => {
    world = await behindProxy({ connectionsPerIp: 2 });
    const first = await raw('198.51.100.1');
    await raw('198.51.100.1');
    const third = await raw('198.51.100.1');
    expect(third.exceptions()).toEqual(['too_many_connections']);
    expect(third.closed).toBe(true);
    // Another address has places of its own.
    expect((await raw('198.51.100.2')).closed).toBe(false);

    first.close();
    await world.time.settle();
    const fourth = await welcomed('198.51.100.1');
    expect(fourth.closed).toBe(false);
  });

  test('a long connection still counts after its count’s TTL', async () => {
    world = await behindProxy({ connectionsPerIp: 1 });
    await raw('198.51.100.1');
    await world.time.advance(25 * MINUTE);
    const second = await raw('198.51.100.1');
    expect(second.exceptions()).toEqual(['too_many_connections']);
  });

  test('new connections are capped per minute', async () => {
    world = await behindProxy({ newConnectionsPerIpPerMinute: 3 });
    for (let i = 0; i < 3; i++) (await raw('198.51.100.1')).close();
    await world.time.settle();
    const fourth = await raw('198.51.100.1');
    expect(fourth.exceptions()).toEqual(['too_many_connections']);

    await world.time.advance(MINUTE / 3);
    expect((await raw('198.51.100.1')).closed).toBe(false);
  });

  test('an exempt address isn’t capped on connections', async () => {
    world = await onlineWorld({ limits: { connectionsPerIp: 1, newConnectionsPerIpPerMinute: 1 } });
    const all = [await raw(), await raw(), await raw()];
    expect(all.map((client) => client.closed)).toEqual([false, false, false]);
  });

  test('an online session refused at the door says so in plain words', async () => {
    world = await onlineWorld({ limits: { exemptIps: [], connectionsPerIp: 1 } });
    await raw();
    const ada = world.client('Ada');
    await eventually(world, () => ada.getState().connection.status === 'failed', 'the refusal');
    const connection = ada.getState().connection;
    if (connection.status !== 'failed') throw new Error('unreachable');
    expect(connection.reason).toBe('too_many_connections');
    expect(errorText(connection.reason, connection.message)).toBe(
      'Too many connections from your network. Try again in a minute.',
    );
  });

  test('X-Forwarded-For is ignored from a peer that isn’t a trusted proxy', async () => {
    world = await onlineWorld({ limits: { exemptIps: [], connectionsPerIp: 1 } });
    await raw('198.51.100.1');
    // Both come from loopback, whatever they say.
    const second = await raw('198.51.100.2');
    expect(second.exceptions()).toEqual(['too_many_connections']);
  });

  test('X-Forwarded-For from a trusted proxy names the client', async () => {
    world = await behindProxy({ connectionsPerIp: 1 });
    await raw('198.51.100.1');
    expect((await raw('198.51.100.2')).closed).toBe(false);
    expect((await raw('198.51.100.1')).exceptions()).toEqual(['too_many_connections']);
  });

  test('rooms created are capped per minute with room_limit', async () => {
    world = await behindProxy({ roomsPerIpPerMinute: 2 });
    const client = await welcomed('198.51.100.1');
    for (let i = 0; i < 2; i++) {
      await send(client, { event: 'createRoom', data: { mode: '1v1' } });
      await send(client, { event: 'leaveRoom', data: {} });
    }
    await send(client, { event: 'createRoom', data: { mode: '1v1' } });
    expect(client.exceptions()).toEqual(['room_limit']);
    expect(errorText('room_limit', 'x')).toBe('Too many rooms created. Try again in a minute.');

    // Another address isn't held back.
    const other = await welcomed('198.51.100.2');
    await send(other, { event: 'createRoom', data: { mode: '1v1' } });
    expect(other.exceptions()).toEqual([]);
  });

  test('an exempt address isn’t capped on rooms', async () => {
    world = await onlineWorld({ limits: { roomsPerIpPerMinute: 1 } });
    const client = await welcomed();
    for (let i = 0; i < 3; i++) {
      await send(client, { event: 'createRoom', data: { mode: '1v1' } });
      await send(client, { event: 'leaveRoom', data: {} });
    }
    expect(client.exceptions()).toEqual([]);
  });

  test('failed joins are capped per minute, then even a real code is refused', async () => {
    world = await behindProxy({ failedJoinsPerIpPerMinute: 2 });
    const host = await welcomed('198.51.100.9');
    await send(host, { event: 'createRoom', data: { mode: 'ffa' } });
    const code = roomCodeOf(host);

    const guesser = await welcomed('198.51.100.1');
    // A successful join doesn't count.
    await send(guesser, { event: 'joinRoom', data: { code } });
    await send(guesser, { event: 'leaveRoom', data: {} });
    await send(guesser, { event: 'joinRoom', data: { code: 'ZZZZ' } });
    await send(guesser, { event: 'joinRoom', data: { code: 'YYYY' } });
    await send(guesser, { event: 'joinRoom', data: { code } });
    expect(guesser.exceptions()).toEqual(['room_not_found', 'room_not_found', 'rate_limited']);

    // Look-ups over HTTP spend from the same count.
    expect((await lookup(code, '198.51.100.1')).status).toBe(429);
    expect(await (await lookup(code, '198.51.100.1')).json()).toMatchObject({
      code: 'rate_limited',
    });

    await world.time.advance(MINUTE);
    await send(guesser, { event: 'joinRoom', data: { code } });
    expect(guesser.exceptions()).toHaveLength(3);
  });

  test('look-ups that find nothing count as failed joins', async () => {
    world = await behindProxy({ failedJoinsPerIpPerMinute: 2 });
    expect((await lookup('ZZZZ', '198.51.100.1')).status).toBe(404);
    expect((await lookup('YYYY', '198.51.100.1')).status).toBe(404);
    expect((await lookup('XXXX', '198.51.100.1')).status).toBe(429);
    const guesser = await welcomed('198.51.100.1');
    await send(guesser, { event: 'joinRoom', data: { code: 'ZZZZ' } });
    expect(guesser.exceptions()).toEqual(['rate_limited']);
  });

  test('an exempt address isn’t capped on failed joins', async () => {
    world = await onlineWorld({ limits: { failedJoinsPerIpPerMinute: 1 } });
    const client = await welcomed();
    for (const code of ['ZZZZ', 'YYYY', 'XXXX']) {
      await send(client, { event: 'joinRoom', data: { code } });
    }
    expect(client.exceptions()).toEqual(['room_not_found', 'room_not_found', 'room_not_found']);
  });

  test('POST /api/sessions is capped per minute with a 429', async () => {
    world = await behindProxy();
    for (let i = 0; i < 10; i++) expect((await postSession('198.51.100.1')).status).toBe(201);
    const refused = await postSession('198.51.100.1');
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: 'rate_limited' });
    expect((await postSession('198.51.100.2')).status).toBe(201);
  });
});

describe('per session and room', () => {
  test('a host asking for another room gets wrong_phase: one hosted room per session', async () => {
    world = await onlineWorld();
    const ada = world.client('Ada');
    await connected(world, ada);
    ada.createRoom('1v1');
    await eventually(world, () => ada.getState().room !== null, 'the room');
    ada.createRoom('ffa');
    await world.time.settle();
    expect(ada.getState().error?.code).toBe('wrong_phase');
  });

  test('a room takes MAX_SPECTATORS spectators, and a join beyond them gets room_full', async () => {
    world = await onlineWorld({ limits: { maxSpectators: 1 } });
    const [ada, bo, cy, di] = ['Ada', 'Bo', 'Cy', 'Di'].map((name) => world.client(name));
    if (!ada || !bo || !cy || !di) throw new Error('unreachable');
    const code = await openRoom(world, '1v1', ada, bo, cy);
    expect(cy.getState().room?.spectators.map(({ nickname }) => nickname)).toEqual(['Cy']);
    await connected(world, di);
    di.joinRoom(code);
    await world.time.settle();
    expect(di.getState().error?.code).toBe('room_full');
    expect(di.getState().room).toBeNull();
  });
});
