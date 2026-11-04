import { afterAll, beforeAll, expect, test } from 'vitest';
import { CLOCK, type Clock } from '../src/clock';
import { DrainingIndicator } from '../src/health';
import { type Booted, boot, connect } from './support/boot';

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

test('a client connects to /ws', async () => {
  const socket = await connect(`${booted.ws}/ws`);
  socket.close();
});

test('/readyz answers 503 once the pod is draining', async () => {
  const draining = await boot();
  draining.app.get(DrainingIndicator).drain();
  const res = await fetch(`${draining.http}/readyz`);
  expect(res.status).toBe(503);
  await draining.app.close();
});

test('tests replace the clock by its token', async () => {
  const fake: Clock = { now: () => 42, after: () => () => {}, every: () => () => {} };
  const faked = await boot({
    override: (builder) => builder.overrideProvider(CLOCK).useValue(fake),
  });
  expect(faked.app.get<Clock>(CLOCK).now()).toBe(42);
  await faked.app.close();
});
