import type { TimerClock } from '@shura/client-core';

/** How long after a wake a bot's loop wakes again: about a frame. Late wakes catch up. */
const WAKE_MS = 16;

/**
 * The bots' clock: `performance.now()`, with a loop wake about every frame (a bot has no screen
 * to draw, so it needn't wake more often), and plain timers.
 */
export const botClock: TimerClock = {
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
