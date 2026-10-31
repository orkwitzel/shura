import type { AddressInfo } from 'node:net';
import { ENGINE_VERSION } from '@shura/engine';
import { PROTOCOL_VERSION } from '@shura/protocol';
import { createMemoryStores } from '@shura/valkey';
import { pino } from 'pino';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { WebSocket as WsClient } from 'ws';
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

test('a message over the size limit closes the connection (1009)', async () => {
  const small = createHttpServer(gateway, { maxPayloadBytes: 64, trustedProxies: [] });
  await new Promise<void>((resolve) => small.listen(0, resolve));
  const socket = new WebSocket(`ws://localhost:${(small.address() as AddressInfo).port}/ws`);
  await new Promise((resolve) => {
    socket.onopen = resolve;
  });
  const closed = new Promise<number>((resolve) => {
    socket.onclose = (event) => resolve(event.code);
  });
  socket.send('x'.repeat(65));
  expect(await closed).toBe(1009);
  small.close();
});

/** The address the gateway is given for a connection with `X-Forwarded-For: forwardedFor`. */
async function addressSeen(trustedProxies: string[], forwardedFor: string): Promise<string> {
  const seen: string[] = [];
  const server = createHttpServer(
    {
      accept(socket, ip) {
        seen.push(ip);
        socket.close();
      },
    },
    { maxPayloadBytes: 1024, trustedProxies },
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const socket = new WsClient(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`, {
    headers: { 'x-forwarded-for': forwardedFor },
  });
  await new Promise((resolve) => socket.on('close', resolve));
  server.close();
  return seen[0] ?? '';
}

test('X-Forwarded-For is ignored from a peer that is not a trusted proxy', async () => {
  expect(await addressSeen([], '198.51.100.1')).toBe('127.0.0.1');
  expect(await addressSeen(['10.0.0.0/8'], '198.51.100.1')).toBe('127.0.0.1');
});

test('X-Forwarded-For names the client behind a trusted proxy', async () => {
  expect(await addressSeen(['127.0.0.1'], '198.51.100.1')).toBe('198.51.100.1');
});
