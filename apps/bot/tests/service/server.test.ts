import type { AddressInfo } from 'node:net';
import type { Connect, Fetch } from '@shura/client-core';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createBotPool } from '../../src/service/bot-pool';
import { createBotServer } from '../../src/service/server';

/**
 * The sessions asked for, and sockets that welcome a `hello` and answer nothing else: what was
 * dialled and sent.
 */
const asked: unknown[] = [];
const dialled: string[] = [];
const sent: unknown[] = [];
const sessions: Fetch = async (url, init) => {
  const { nickname } = JSON.parse(init.body ?? '{}') as { nickname: string };
  asked.push({ url, nickname });
  const answer = { sessionId: `id-${nickname}`, sessionToken: `token-${nickname}`, nickname };
  return { ok: true, status: 201, json: async () => answer };
};
const stalled: Connect = (url, handlers) => {
  dialled.push(url);
  queueMicrotask(handlers.open);
  const send = (text: string) => {
    const message = JSON.parse(text) as { event: string; data: { sessionToken?: string } };
    sent.push(message);
    if (message.event !== 'hello') return;
    const sessionId = message.data.sessionToken?.replace('token-', 'id-') ?? '';
    const welcome = { event: 'welcome', data: { sessionId, serverTime: 0 } };
    queueMicrotask(() => handlers.message(JSON.stringify(welcome)));
  };
  return { send, close: () => {} };
};

const pool = createBotPool({
  serverUrl: 'http://gateway.test',
  connect: stalled,
  fetch: sessions,
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
  asked.length = 0;
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

/** `POST /bots` with `body` as JSON, or as it is if it's text. */
const post = (body: unknown) =>
  fetch(`${base}/bots`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('POST /bots adds bots to a room, each a session of its own name on the gateway', async () => {
  const res = await post({ room: 'k7qx', count: 3 });
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({
    bots: [
      { name: 'Ada', profile: 'casual', room: 'K7QX' },
      { name: 'Turing', profile: 'casual', room: 'K7QX' },
      { name: 'Hopper', profile: 'casual', room: 'K7QX' },
    ],
  });
  await vi.waitFor(() => expect(dialled).toHaveLength(3));
  expect(asked).toEqual(
    ['Ada', 'Turing', 'Hopper'].map((nickname) => ({
      url: 'http://gateway.test/api/sessions',
      nickname,
    })),
  );
  expect(dialled).toEqual(Array.from({ length: 3 }, () => 'ws://gateway.test/ws'));
  // Each says it's a bot in its hello.
  await vi.waitFor(() =>
    expect(sent).toContainEqual({
      event: 'hello',
      data: expect.objectContaining({ sessionToken: 'token-Turing', kind: 'bot' }),
    }),
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
  // It asks to quick-match once welcomed.
  await vi.waitFor(() => expect(sent).toContainEqual({ event: 'quickMatch', data: {} }));
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
  [{ quickMatch: false }],
  [{ room: 'K7QX', profile: 'expert' }],
  [{ count: 2 }],
  ['not json'],
])('a bad request %j is refused with 400 and adds nothing', async (body) => {
  const res = await post(body);
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: unknown }).error).toEqual(expect.any(String));
  expect(asked).toEqual([]);
});

test('DELETE without a room code is refused; other paths and methods are not found or not allowed', async () => {
  expect((await fetch(`${base}/bots`, { method: 'DELETE' })).status).toBe(400);
  expect((await fetch(`${base}/bots`, { method: 'PUT' })).status).toBe(405);
  expect((await fetch(`${base}/nope`)).status).toBe(404);
  expect((await fetch(`${base}/livez`)).status).toBe(200);
});

test('a body over 4 KiB is refused with 413, counted in bytes, not characters', async () => {
  // 2,100 Hebrew letters: well under 4,096 characters, but 4,200 bytes in UTF-8.
  const res = await post({ room: 'K7QX', note: 'ש'.repeat(2_100) });
  expect(res.status).toBe(413);
  expect(((await res.json()) as { error: unknown }).error).toEqual(expect.any(String));
  expect(asked).toEqual([]);
});
