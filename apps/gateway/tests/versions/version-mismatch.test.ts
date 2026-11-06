import { ENGINE_VERSION } from '@shura/engine';
import {
  ENGINE_VERSION_HEADER,
  ERRORS,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_HEADER,
} from '@shura/protocol';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { postJson, VERSION_HEADERS } from '../support/api';
import { type Booted, boot, connect, nextMessage } from '../support/boot';

let booted: Booted;

beforeAll(async () => {
  booted = await boot();
});
afterAll(async () => {
  await booted.app.close();
});

const mismatch = { code: 'version_mismatch', message: ERRORS.version_mismatch.message };

describe('POST /api/sessions (design §8.3)', () => {
  test.each([
    [
      'an older protocol',
      { ...VERSION_HEADERS, [PROTOCOL_VERSION_HEADER]: String(PROTOCOL_VERSION - 1) },
    ],
    ['a newer engine', { ...VERSION_HEADERS, [ENGINE_VERSION_HEADER]: String(ENGINE_VERSION + 1) }],
    ['no version headers', {}],
  ])('%s gets version_mismatch (426)', async (_, headers) => {
    const res = await postJson(`${booted.http}/api/sessions`, { nickname: 'Ada' }, headers);
    expect(res.status).toBe(426);
    expect(await res.json()).toEqual(mismatch);
  });

  test('the health probes need no version headers', async () => {
    expect((await fetch(`${booted.http}/livez`)).status).toBe(200);
  });
});

describe('hello (design §8.3)', () => {
  const session = async () => {
    const res = await postJson(`${booted.http}/api/sessions`, { nickname: 'Ada' });
    return (await res.json()) as { sessionToken: string };
  };

  test('a mismatched hello gets an exception and the socket is closed', async () => {
    const { sessionToken } = await session();
    const socket = await connect(`${booted.ws}/ws`);
    const closed = new Promise((resolve) => socket.once('close', resolve));
    socket.send(
      JSON.stringify({
        event: 'hello',
        data: {
          protocolVersion: PROTOCOL_VERSION + 1,
          engineVersion: ENGINE_VERSION,
          clientVersion: 'test',
          sessionToken,
        },
      }),
    );
    expect(await nextMessage(socket)).toEqual({ event: 'exception', data: mismatch });
    await closed;
  });
});
