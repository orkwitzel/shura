import { expect, test } from 'vitest';
import { boot, connect } from './support/boot';

test('a room link connects to /room-links', async () => {
  const booted = await boot();
  const socket = await connect(`${booted.ws}/room-links`);
  expect(socket.readyState).toBe(socket.OPEN);
  socket.close();
  await booted.app.close();
});
