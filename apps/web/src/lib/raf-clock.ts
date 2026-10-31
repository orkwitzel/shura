import type { Clock } from '@shura/client-core';

/**
 * The web's clock (design §13.1, Game loop): `performance.now()`, waking the loop with
 * `requestAnimationFrame`. Its time only runs, and it only wakes anything, while started, so a
 * session can be made during render and only start (its countdown included) once the board is on
 * screen: callbacks scheduled before `start`, or while stopped, wait for it, and the time before
 * `start`, or while stopped, never passes for them.
 */
export interface RafClock extends Clock {
  /** Wakes the callbacks waiting, at the next animation frame, and every one scheduled after. */
  start(): void;
  /** Cancels the animation frame asked for, if any: nothing wakes until `start` again. */
  stop(): void;
}

export function createRafClock(): RafClock {
  /** The callbacks waiting for the next animation frame. */
  let waiting = new Set<() => void>();
  let running = false;
  let frame: number | null = null;
  /** The clock's time when it last stopped (or was made). */
  let stoppedAt = 0;
  /** `performance.now()` minus the clock's time, while running. */
  let offset = 0;
  const now = () => (running ? performance.now() - offset : stoppedAt);

  const wake = () => {
    frame = null;
    const due = waiting;
    waiting = new Set();
    for (const callback of due) callback();
  };
  const request = () => {
    if (running && frame === null && waiting.size > 0) frame = requestAnimationFrame(wake);
  };

  return {
    now,
    schedule(callback) {
      // A wrapper, so scheduling the same function twice wakes it twice.
      const call = () => callback();
      waiting.add(call);
      request();
      return () => {
        waiting.delete(call);
      };
    },
    start() {
      if (running) return;
      offset = performance.now() - stoppedAt;
      running = true;
      request();
    },
    stop() {
      stoppedAt = now();
      running = false;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
