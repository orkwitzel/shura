/// <reference types="node" />
import { ENGINE_VERSION } from '@shura/engine';
import { PROTOCOL_VERSION } from '@shura/protocol';
import { describe, expect, test } from 'vitest';
import { createApi, type Fetch, isOnlineError, OnlineError, socketUrl } from '../../src/index';

interface Call {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

/** A `fetch` that answers every request with `status` and `body`, and records the requests. */
function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetch, calls };
}

const SESSION = { sessionId: 's1', sessionToken: 'tok', nickname: 'Ada' };

describe('createSession (POST /api/sessions, design §8.7)', () => {
  test('posts the nickname with the version headers, and gives the session back', async () => {
    const { fetch, calls } = fakeFetch(201, SESSION);
    const api = createApi({ serverUrl: 'http://localhost:8080', fetch });
    expect(await api.createSession({ nickname: 'Ada' })).toEqual(SESSION);
    expect(calls).toEqual([
      {
        url: 'http://localhost:8080/api/sessions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Shura-Protocol': String(PROTOCOL_VERSION),
          'Shura-Engine': String(ENGINE_VERSION),
        },
        body: { nickname: 'Ada' },
      },
    ]);
  });

  test('a { code, message } body is the same error type as a socket exception', async () => {
    const { fetch } = fakeFetch(426, { code: 'version_mismatch', message: 'Update.' });
    const api = createApi({ serverUrl: 'http://localhost:8080', fetch });
    const error = await api.createSession({ nickname: 'Ada' }).catch((caught) => caught);
    expect(isOnlineError(error)).toBe(true);
    expect(error).toMatchObject({ code: 'version_mismatch', message: 'Update.', status: 426 });
  });

  test("a server that can't be reached is `unreachable`", async () => {
    const api = createApi({
      serverUrl: 'http://localhost:8080',
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    await expect(api.createSession({ nickname: 'Ada' })).rejects.toMatchObject({
      code: 'unreachable',
    });
  });

  test('an answer that fails its schema is refused', async () => {
    const { fetch } = fakeFetch(201, { sessionId: 's1' });
    const api = createApi({ serverUrl: 'http://localhost:8080', fetch });
    await expect(api.createSession({ nickname: 'Ada' })).rejects.toBeInstanceOf(OnlineError);
  });
});

describe('lookupRoom (GET /api/rooms/:code)', () => {
  test("gives the room's mode and counts", async () => {
    const room = { code: 'K7QX', mode: '1v1', seats: 2, seated: 1, spectators: 0 };
    const { fetch, calls } = fakeFetch(200, room);
    const api = createApi({ serverUrl: 'https://shura.example/', fetch });
    expect(await api.lookupRoom('K7QX')).toEqual(room);
    expect(calls[0]).toMatchObject({ url: 'https://shura.example/api/rooms/K7QX', method: 'GET' });
  });

  test('an unknown code is room_not_found', async () => {
    const { fetch } = fakeFetch(404, { code: 'room_not_found', message: 'No room.' });
    const api = createApi({ serverUrl: 'http://localhost:8080', fetch });
    await expect(api.lookupRoom('ZZZZ')).rejects.toMatchObject({ code: 'room_not_found' });
  });
});

test('the socket URL is the server origin with ws(s) and /ws (design §13.3)', () => {
  expect(socketUrl('http://localhost:8080')).toBe('ws://localhost:8080/ws');
  expect(socketUrl('https://shura.example/')).toBe('wss://shura.example/ws');
});
