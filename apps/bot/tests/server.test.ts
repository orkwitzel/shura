import type { AddressInfo } from 'node:net';
import type { Connect } from '@shura/client-core';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createBotPool } from '../src/bot-pool';
import { createBotServer } from '../src/server';

/** Sockets that open but never answer, and remember what was dialled and sent. */
const dialled: string[] = [];
const sent: unknown[] = [];
const stalled: Connect = (url, handlers) => {
  dialled.push(url);
  queueMicrotask(handlers.open);
  return { send: (text) => sent.push(JSON.parse(text)), close: () => {} };
};

const pool = createBotPool({
  url: 'ws://gateway.test',
  connect: stalled,
  clock: { now: () => 0, schedule: () => () => {}, after: () => () => {} },
  logger: pino({ level: 'silent' }),
  seed: 1,
  clientVersion: 'test',
});
const server = createBotServer(pool);
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => {
  pool.close();
  dialled.length = 0;
  sent.length = 0;
});
afterAll(() => {
  pool.close();
  server.close();
});

interface Listing {
  bots: { name: string }[];
}

const post = (body: unknown) =>
  fetch(`${base}/bots`, { method: 'POST', body: JSON.stringify(body) });

test('POST /bots adds bots to a room, each with its own name, on the gateway', async () => {
  const res = await post({ room: 'k7qx', count: 3 });
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({
    bots: [
      { name: 'Ada', profile: 'casual', room: 'K7QX' },
      { name: 'Turing', profile: 'casual', room: 'K7QX' },
      { name: 'Hopper', profile: 'casual', room: 'K7QX' },
    ],
  });
  expect(dialled).toEqual(['ws://gateway.test', 'ws://gateway.test', 'ws://gateway.test']);
  // Each says it's a bot in its hello.
  expect(sent).toContainEqual(
    expect.objectContaining({ type: 'hello', nickname: 'Turing', kind: 'bot' }),
  );
  const list = (await (await fetch(`${base}/bots`)).json()) as Listing;
  expect(list.bots.map(({ name }) => name)).toEqual(['Ada', 'Turing', 'Hopper']);
});

test('a pps override and quick-match are taken', async () => {
  const res = await post({ quickMatch: true, pps: 3 });
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({
    bots: [{ name: 'Ada', profile: 'casual', quickMatch: true, pps: 3 }],
  });
});

test('DELETE /bots?room= removes that room’s bots only', async () => {
  await post({ room: 'K7QX', count: 2 });
  await post({ room: 'AB23', count: 1 });
  const res = await fetch(`${base}/bots?room=K7QX`, { method: 'DELETE' });
  expect(await res.json()).toEqual({ removed: 2 });
  const list = (await (await fetch(`${base}/bots`)).json()) as Listing;
  expect(list.bots).toEqual([{ name: 'Hopper', profile: 'casual', room: 'AB23' }]);
  // Names freed by removed bots are given again.
  const again = (await (await post({ room: 'AB23' })).json()) as Listing;
  expect(again.bots[0]?.name).toBe('Ada');
});

test.each([
  [{ room: 'K7QX', count: 0 }],
  [{ room: 'nope!' }],
  [{ room: 'K7QX', quickMatch: true }],
  [{ room: 'K7QX', profile: 'expert' }],
  [{ count: 2 }],
  ['not json'],
])('a bad request %j is refused with 400 and adds nothing', async (body) => {
  const res = await post(body);
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: unknown }).error).toEqual(expect.any(String));
  expect(dialled).toEqual([]);
});

test('DELETE without a room code is refused; other paths and methods are not found or not allowed', async () => {
  expect((await fetch(`${base}/bots`, { method: 'DELETE' })).status).toBe(400);
  expect((await fetch(`${base}/bots`, { method: 'PUT' })).status).toBe(405);
  expect((await fetch(`${base}/nope`)).status).toBe(404);
  expect((await fetch(`${base}/livez`)).status).toBe(200);
});
