import type { ServerClock } from '../../src/clock';

/** A server clock whose time moves only when the test says (design §14). */
export interface FakeClock extends ServerClock {
  /** Moves time forward to `time`, firing each timer due on the way at its own time. */
  advanceTo(time: number): void;
  /** Moves time forward to `time` without firing the timers due on the way, as a busy loop would. */
  jumpTo(time: number): void;
}

interface Timer {
  at: number;
  callback: () => void;
  every?: number;
}

export function fakeClock(start: number): FakeClock {
  let time = start;
  let timers: Timer[] = [];
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
    after: (ms, callback) => add({ at: time + ms, callback }),
    every: (ms, callback) => add({ at: time + ms, callback, every: ms }),
    advanceTo(until) {
      for (let timer = nextDue(until); timer; timer = nextDue(until)) {
        time = timer.at;
        if (timer.every === undefined) timers = timers.filter((other) => other !== timer);
        else timer.at += timer.every;
        timer.callback();
      }
      time = Math.max(time, until);
    },
    jumpTo(until) {
      time = Math.max(time, until);
    },
  };
}
