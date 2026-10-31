import type { AddressInfo } from 'node:net';
import { ENGINE_VERSION } from '@shura/engine';
import { PROTOCOL_VERSION } from '@shura/protocol';
import { createMemoryStores } from '@shura/valkey';
import { pino } from 'pino';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { systemClock } from '../src/clock';
import { createGateway } from '../src/gateway';
import { createHttpServer } from '../src/server';

const gateway = createGateway({
  clock: systemClock,
  stores: createMemoryStores(),
  dial: () => {
    throw new Error('no game pods in this test');
  },
  logger: pino({ level: 'silent' }),
});
const server = createHttpServer(gateway);
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});

test.each(['/livez', '/readyz'])('%s answers 200', async (path) => {
  const res = await fetch(`http://${base}${path}`);
  expect(res.status).toBe(200);
});

test('unknown paths answer 404', async () => {
  const res = await fetch(`http://${base}/nope`);
  expect(res.status).toBe(404);
});

/** Opens a WebSocket to the gateway, sends `hello`, and collects what comes back until it closes. */
async function helloOver(hello: Record<string, unknown>): Promise<{ messages: unknown[] }> {
  const socket = new WebSocket(`ws://${base}/ws`);
  const messages: unknown[] = [];
  socket.onmessage = (event) => messages.push(JSON.parse(String(event.data)));
  await new Promise((resolve) => {
    socket.onopen = resolve;
  });
  socket.send(JSON.stringify({ type: 'hello', clientVersion: 'test', nickname: 'Ada', ...hello }));
  const closed = new Promise((resolve) => {
    socket.onclose = resolve;
  });
  // A welcome leaves the socket open: close it once it has come.
  await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 200))]);
  socket.close();
  await closed;
  return { messages };
}

test('a hello with the right versions is welcomed over a real WebSocket', async () => {
  const { messages } = await helloOver({
    protocolVersion: PROTOCOL_VERSION,
    engineVersion: ENGINE_VERSION,
  });
  expect(messages).toEqual([
    expect.objectContaining({ type: 'welcome', nickname: 'Ada', sessionId: expect.any(String) }),
  ]);
});

test.each([
  ['protocol', { protocolVersion: PROTOCOL_VERSION + 1, engineVersion: ENGINE_VERSION }],
  ['engine', { protocolVersion: PROTOCOL_VERSION, engineVersion: ENGINE_VERSION - 1 }],
])('a hello with another %s version gets version_mismatch, and is closed', async (_, versions) => {
  const { messages } = await helloOver(versions);
  expect(messages).toEqual([expect.objectContaining({ type: 'error', code: 'version_mismatch' })]);
});

test('an invalid nickname gets nickname_invalid, and is closed', async () => {
  const { messages } = await helloOver({
    protocolVersion: PROTOCOL_VERSION,
    engineVersion: ENGINE_VERSION,
    nickname: '  ',
  });
  expect(messages).toEqual([expect.objectContaining({ type: 'error', code: 'nickname_invalid' })]);
});
