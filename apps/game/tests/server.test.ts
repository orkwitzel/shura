import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createHttpServer } from '../src/server';

const server = createHttpServer();
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});

test.each(['/livez', '/readyz'])('%s answers 200', async (path) => {
  const res = await fetch(base + path);
  expect(res.status).toBe(200);
});

test('unknown paths answer 404', async () => {
  const res = await fetch(`${base}/nope`);
  expect(res.status).toBe(404);
});
