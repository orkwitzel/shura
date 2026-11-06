import { Test } from '@nestjs/testing';
import { afterEach, expect, test, vi } from 'vitest';
import { CLOCK, type Clock, ClockModule, systemClock } from '../../src/clock';

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
  const moduleRef = await Test.createTestingModule({ imports: [ClockModule] })
    .overrideProvider(CLOCK)
    .useValue(fake)
    .compile();
  expect(moduleRef.get<Clock>(CLOCK).now()).toBe(42);
});
