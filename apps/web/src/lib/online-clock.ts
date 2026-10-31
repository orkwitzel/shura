import type { TimerClock } from '@shura/client-core';

/**
 * The online session's clock (design §13.1, Online session): `performance.now()`, waking the loop
 * with `requestAnimationFrame` and the pings with `setTimeout`. Unlike the solo `RafClock`, its
 * time always runs: an online match starts at the server's `startAt`, not when the board shows.
 *
 * A hidden tab stops animation frames, so a match there needs the loop woken by `worker-timers`
 * instead (design §8.4): that swap belongs here, in `schedule`, with the match screen (#69).
 */
export function createOnlineClock(): TimerClock {
  return {
    now: () => performance.now(),
    schedule(callback) {
      const frame = requestAnimationFrame(() => callback());
      return () => cancelAnimationFrame(frame);
    },
    after(ms, callback) {
      const timer = setTimeout(callback, ms);
      return () => clearTimeout(timer);
    },
  };
}
