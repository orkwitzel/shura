import type { TimerClock } from '@shura/client-core';
import type { ServerClock } from '../../src/clock';

/**
 * One fake clock for the gateway, the game service and the clients in an in-process test
 * (design §14): time passes only when the test says, so countdowns and timers run without waiting.
 */
export interface FakeTime extends ServerClock, TimerClock {
  /**
   * Moves time forward by `ms`, firing each timer due on the way at its own time, and then waking
   * every loop that asked to be woken soon (once, however far time moved), and lets the messages
   * that set off travel.
   */
  advance(ms: number): Promise<void>;
  /** Lets every message in flight arrive, and everything it sets off finish, without time moving. */
  settle(): Promise<void>;
}

interface Timer {
  at: number;
  callback: () => void;
  every?: number;
}

/** Lets every queued microtask, and every one they queue, run. */
export const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export function fakeTime(start: number): FakeTime {
  let time = start;
  let timers: Timer[] = [];
  let soon: (() => void)[] = [];
  const add = (timer: Timer) => {
    timers.push(timer);
    return () => {
      timers = timers.filter((other) => other !== timer);
    };
  };
  const nextDue = (until: number) =>
    timers.filter(({ at }) => at <= until).sort((a, b) => a.at - b.at)[0];
  return {
    now: () => time,
    schedule(callback) {
      const wake = () => callback();
      soon.push(wake);
      return () => {
        soon = soon.filter((other) => other !== wake);
      };
    },
    after: (ms, callback) => add({ at: time + ms, callback }),
    every: (ms, callback) => add({ at: time + ms, callback, every: ms }),
    async advance(ms) {
      const until = time + ms;
      for (let timer = nextDue(until); timer; timer = nextDue(until)) {
        time = timer.at;
        if (timer.every === undefined) timers = timers.filter((other) => other !== timer);
        else timer.at += timer.every;
        timer.callback();
        await settle();
      }
      time = until;
      const due = soon;
      soon = [];
      for (const wake of due) wake();
      await settle();
    },
    settle,
  };
}
