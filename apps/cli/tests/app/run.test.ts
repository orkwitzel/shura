import { expect, test } from 'vitest';
import { onlineNetwork } from '../../src/app/run';

test('online play links rooms to SHURA_WEB, and to the server without it', () => {
  const server = 'https://shura.example';
  expect(onlineNetwork({ server }, undefined, {}).web).toBe(server);
  expect(onlineNetwork({ server }, undefined, { SHURA_WEB: 'http://127.0.0.1:5173' }).web).toBe(
    'http://127.0.0.1:5173',
  );
});
