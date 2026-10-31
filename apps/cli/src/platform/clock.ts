import type { TimerClock } from '@shura/client-core';

/** How long after a wake the loop wakes again. Late wakes catch up (design §13.1). */
const WAKE_MS = 4;

/**
 * The CLI's clock (design §13.1): `performance.now()` and a ~4 ms timer, and plain timers for an
 * online session's pings.
 */
export function terminalClock(): TimerClock {
  return {
    now: () => performance.now(),
    schedule(callback) {
      const timer = setTimeout(callback, WAKE_MS);
      return () => clearTimeout(timer);
    },
    after(ms, callback) {
      const timer = setTimeout(callback, ms);
      return () => clearTimeout(timer);
    },
  };
}
