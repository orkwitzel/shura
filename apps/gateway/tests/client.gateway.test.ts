import { expect, test } from 'vitest';
import { boot, connect } from './support/boot';

test('a client connects to /ws', async () => {
  const booted = await boot();
  const socket = await connect(`${booted.ws}/ws`);
  expect(socket.readyState).toBe(socket.OPEN);
  socket.close();
  await booted.app.close();
});
