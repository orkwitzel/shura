import { afterAll, beforeAll, expect, test } from 'vitest';
import { DrainingIndicator } from '../../src/health';
import { type Booted, boot } from '../support/boot';

let booted: Booted;

beforeAll(async () => {
  booted = await boot();
});
afterAll(async () => {
  await booted.app.close();
});

test('/livez answers 200', async () => {
  const res = await fetch(`${booted.http}/livez`);
  expect(res.status).toBe(200);
});

test('/readyz answers 200 while not draining', async () => {
  const res = await fetch(`${booted.http}/readyz`);
  expect(res.status).toBe(200);
});

test('/readyz answers 503 once the pod is draining', async () => {
  const draining = await boot();
  draining.app.get(DrainingIndicator).drain();
  const res = await fetch(`${draining.http}/readyz`);
  expect(res.status).toBe(503);
  await draining.app.close();
});
