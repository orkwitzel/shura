import { ENGINE_VERSION } from '@shura/engine';
import { PROTOCOL_VERSION } from '@shura/protocol';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { WebSocket } from 'ws';
import { postJson } from '../support/api';
import { type Booted, boot, connect, nextMessage } from '../support/boot';

let booted: Booted;

beforeAll(async () => {
  booted = await boot();
});
afterAll(async () => {
  await booted.app.close();
});

const createSession = (body: object) => postJson(`${booted.http}/api/sessions`, body);

interface SessionAnswer {
  readonly sessionId: string;
  readonly sessionToken: string;
  readonly nickname: string;
}
const session = async (body: object) => (await (await createSession(body)).json()) as SessionAnswer;

const hello = (socket: WebSocket, sessionToken: string) =>
  socket.send(
    JSON.stringify({
      event: 'hello',
      data: {
        protocolVersion: PROTOCOL_VERSION,
        engineVersion: ENGINE_VERSION,
        clientVersion: 'test',
        sessionToken,
      },
    }),
  );

describe('POST /api/sessions (design §8.7, §10.2)', () => {
  test('a new session, with the nickname as the server normalized it', async () => {
    const res = await createSession({ nickname: '  Ada  ' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      sessionId: expect.any(String),
      sessionToken: expect.any(String),
      nickname: 'Ada',
    });
  });

  test('a still-valid token resumes its session', async () => {
    const first = await session({ nickname: 'Ada' });
    const again = await session({ nickname: 'Bo', sessionToken: first.sessionToken });
    expect(again).toEqual(first);
  });

  test('a nickname that can’t be used is nickname_invalid', async () => {
    const res = await createSession({ nickname: '' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'nickname_invalid' });
  });
});

describe('the socket (design §8.7)', () => {
  test('hello with the token is welcomed as that session', async () => {
    const { sessionId, sessionToken } = await session({ nickname: 'Ada' });
    const socket = await connect(`${booted.ws}/ws`);
    hello(socket, sessionToken);
    expect(await nextMessage(socket)).toEqual({
      event: 'welcome',
      data: { sessionId, serverTime: expect.any(Number) },
    });
    socket.close();
  });

  test('a message before hello gets session_required; ping works anyway', async () => {
    const socket = await connect(`${booted.ws}/ws`);
    socket.send(JSON.stringify({ event: 'createRoom', data: { mode: '1v1' } }));
    expect(await nextMessage(socket)).toMatchObject({
      event: 'exception',
      data: { code: 'session_required' },
    });
    socket.send(JSON.stringify({ event: 'ping', data: { id: 3 } }));
    expect(await nextMessage(socket)).toEqual({
      event: 'pong',
      data: { id: 3, serverTime: expect.any(Number) },
    });
    socket.close();
  });

  test('hello with an unknown token gets session_required', async () => {
    const socket = await connect(`${booted.ws}/ws`);
    hello(socket, 'nope');
    expect(await nextMessage(socket)).toMatchObject({
      event: 'exception',
      data: { code: 'session_required' },
    });
  });
});

test('GET /api/rooms/:code of no room is room_not_found (404)', async () => {
  const res = await fetch(`${booted.http}/api/rooms/ZZZZ`, {
    headers: { 'Shura-Protocol': String(PROTOCOL_VERSION), 'Shura-Engine': String(ENGINE_VERSION) },
  });
  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({ code: 'room_not_found' });
});
