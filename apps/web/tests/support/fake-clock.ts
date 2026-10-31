import type { Clock } from '@shura/client-core';

/** A clock that tests move by hand: time only passes, and the loop only wakes, when they say. */
export interface FakeClock extends Clock {
  /** Moves time forward by `ms`, then wakes everything scheduled before the call, once. */
  advance(ms: number): void;
  /** Moves time forward by `ms`, waking every `every` ms (and at the end), like an on-time timer. */
  run(ms: number, every?: number): void;
}

/** A fake clock starting at `start` milliseconds (copied from client-core's test support). */
export function fakeClock(start = 0): FakeClock {
  let time = start;
  let waiting: (() => void)[] = [];
  const clock: FakeClock = {
    now: () => time,
    schedule(callback) {
      const wake = () => callback();
      waiting.push(wake);
      return () => {
        waiting = waiting.filter((other) => other !== wake);
      };
    },
    advance(ms) {
      time += ms;
      const due = waiting;
      waiting = [];
      for (const wake of due) wake();
    },
    run(ms, every = 16) {
      for (let left = ms; left > 0; left -= every) clock.advance(Math.min(every, left));
    },
  };
  return clock;
}
