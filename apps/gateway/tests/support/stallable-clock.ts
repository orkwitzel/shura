import type { TimerClock } from '@shura/client-core';

/** A client's clock whose game loop can be stalled: a frozen tab or a sleeping laptop. */
export interface StallableClock {
  /** Wraps the client's clock (`client(name, { clockThrough })`). */
  readonly through: (clock: TimerClock) => TimerClock;
  /**
   * Stops waking the client's loop: it plays no more frames and sends no more batches, while its
   * socket stays open and its pings go on, so only the server's clock rule (design §8.4) notices.
   */
  stall(): void;
}

export function stallableClock(): StallableClock {
  let stalled = false;
  return {
    through: (clock) => ({
      now: () => clock.now(),
      after: (ms, callback) => clock.after(ms, callback),
      schedule: (callback) => (stalled ? () => {} : clock.schedule(callback)),
    }),
    stall() {
      stalled = true;
    },
  };
}
