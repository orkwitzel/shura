import type { TimerClock } from '@shura/client-core';
import type { Clock } from '../../src/clock';

/**
 * One fake clock for the gateway, the game service and the clients of an integration test (design
 * §14): game time passes only when the test says, so countdowns, ticks and pings run without
 * waiting. The sockets between them are real, so messages still need real event-loop turns to
 * travel: `settle()` gives them those.
 */
export interface FakeTime extends Clock, TimerClock {
  /**
   * Moves time forward by `ms`, firing each timer due on the way at its own time and settling
   * after each, then wakes every loop that asked to be woken soon (once, however far time moved),
   * and settles again.
   */
  advance(ms: number): Promise<void>;
  /**
   * Lets every message in flight arrive, and everything it sets off finish, without game time
   * moving: real event-loop turns until the traffic has been quiet for a while.
   */
  settle(): Promise<void>;
  /** Counts one message or request: `settle()` waits until these stop. */
  traffic(): void;
  /** A request has started; `settle()` waits for its end (`done`), however long it takes. */
  pending(): () => void;
}

interface Timer {
  at: number;
  readonly callback: () => void;
  readonly every?: number;
}

/** How many quiet real turns in a row count as settled. */
const QUIET_TURNS = 4;

/** One real turn of the event loop, with time for loopback I/O to come in. */
const realTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

/** A fake clock starting at `start` (ms since the epoch). */
export function fakeTime(start: number): FakeTime {
  let time = start;
  let timers: Timer[] = [];
  let soon: (() => void)[] = [];
  let seen = 0;
  let inFlight = 0;
  const add = (timer: Timer) => {
    timers.push(timer);
    return () => {
      timers = timers.filter((other) => other !== timer);
    };
  };
  const nextDue = (until: number) =>
    timers.filter(({ at }) => at <= until).sort((a, b) => a.at - b.at)[0];
  const settle = async () => {
    let last = -1;
    let quiet = 0;
    while (quiet < QUIET_TURNS || inFlight > 0) {
      await realTurn();
      if (seen !== last || inFlight > 0) {
        last = seen;
        quiet = 0;
      } else {
        quiet++;
      }
    }
  };
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
    traffic() {
      seen++;
    },
    pending() {
      inFlight++;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        inFlight--;
        seen++;
      };
    },
  };
}
