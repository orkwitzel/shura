import { afterEach, expect, test, vi } from 'vitest';
import { CLOCK, type Clock, systemClock } from '../../src/clock';
import { boot } from '../support/boot';

afterEach(() => {
  vi.useRealTimers();
});

test('the system clock reads Date.now', () => {
  vi.useFakeTimers({ now: 1_000 });
  expect(systemClock.now()).toBe(1_000);
});

test('after() calls back once, unless cancelled', () => {
  vi.useFakeTimers();
  const fired = vi.fn();
  const cancelled = vi.fn();
  systemClock.after(100, fired);
  systemClock.after(100, cancelled)();
  vi.advanceTimersByTime(250);
  expect(fired).toHaveBeenCalledOnce();
  expect(cancelled).not.toHaveBeenCalled();
});

test('every() calls back each period until stopped', () => {
  vi.useFakeTimers();
  const tick = vi.fn();
  const stop = systemClock.every(100, tick);
  vi.advanceTimersByTime(250);
  stop();
  vi.advanceTimersByTime(250);
  expect(tick).toHaveBeenCalledTimes(2);
});

test('tests replace the clock by its token', async () => {
  const fake: Clock = { now: () => 42, after: () => () => {}, every: () => () => {} };
  const faked = await boot({
    override: (builder) => builder.overrideProvider(CLOCK).useValue(fake),
  });
  expect(faked.app.get<Clock>(CLOCK).now()).toBe(42);
  await faked.app.close();
});
