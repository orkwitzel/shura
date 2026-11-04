import { ERRORS } from '@shura/protocol';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { type Booted, boot, connect, nextMessage } from '../support/boot';
import { EchoModule } from '../support/fixtures/echo';

let booted: Booted;

beforeAll(async () => {
  booted = await boot({ module: EchoModule });
});
afterAll(async () => {
  await booted.app.close();
});

const post = (body: unknown) =>
  fetch(`${booted.http}/api/echo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

test('a valid request body passes', async () => {
  const res = await post({ id: 1 });
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ id: 1 });
});

test('an invalid request body is rejected with invalid_message', async () => {
  const res = await post({ id: 'one' });
  expect(res.status).toBe(ERRORS.invalid_message.status);
  expect(await res.json()).toEqual({
    code: 'invalid_message',
    message: ERRORS.invalid_message.message,
  });
});

test('a valid message passes', async () => {
  const socket = await connect(`${booted.ws}/room-links`);
  socket.send(JSON.stringify({ event: 'echo', data: { id: 1 } }));
  expect(await nextMessage(socket)).toEqual({ event: 'echo', data: { id: 1 } });
  socket.close();
});

test('an invalid message is answered with exception{ invalid_message }', async () => {
  const socket = await connect(`${booted.ws}/room-links`);
  socket.send(JSON.stringify({ event: 'echo', data: { id: 'one' } }));
  expect(await nextMessage(socket)).toEqual({
    event: 'exception',
    data: { code: 'invalid_message', message: ERRORS.invalid_message.message },
  });
  socket.close();
});
