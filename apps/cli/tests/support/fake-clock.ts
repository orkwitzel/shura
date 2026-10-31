import type { Clock } from '@shura/client-core';

/** A clock tests move by hand (as client-core's tests/support/fake-clock.ts, trimmed). */
export interface FakeClock extends Clock {
  /** Moves time forward by `ms`, waking every `every` ms (and at the end), like an on-time timer. */
  run(ms: number, every?: number): void;
  /** How many callbacks are waiting to wake. */
  readonly pending: number;
}

export function fakeClock(start = 0): FakeClock {
  let time = start;
  let waiting: (() => void)[] = [];
  const advance = (ms: number) => {
    time += ms;
    const due = waiting;
    waiting = [];
    for (const wake of due) wake();
  };
  return {
    now: () => time,
    schedule(callback) {
      const wake = () => callback();
      waiting.push(wake);
      return () => {
        waiting = waiting.filter((other) => other !== wake);
      };
    },
    run(ms, every = 4) {
      for (let left = ms; left > 0; left -= every) advance(Math.min(every, left));
    },
    get pending() {
      return waiting.length;
    },
  };
}
