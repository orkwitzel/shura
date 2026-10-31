import type { Clock } from '@shura/client-core';

/** How long after a wake the loop wakes again. Late wakes catch up (design §13.1). */
const WAKE_MS = 4;

/** The CLI's clock (design §13.1): `performance.now()` and a ~4 ms timer. */
export function terminalClock(): Clock {
  return {
    now: () => performance.now(),
    schedule(callback) {
      const timer = setTimeout(callback, WAKE_MS);
      return () => clearTimeout(timer);
    },
  };
}
