import type { TimerClock } from '@shura/client-core';
import { clearTimeout as clearWorkerTimeout, setTimeout as setWorkerTimeout } from 'worker-timers';

/** What the online clock needs from the browser; tests give it a fake. */
export interface ClockPlatform {
  now(): number;
  /** Calls `callback` at the next animation frame. Returns its cancel. */
  requestFrame(callback: () => void): () => void;
  /** Calls `callback` after `ms`, from a timer in a Web Worker. Returns its cancel. */
  workerTimeout(callback: () => void, ms: number): () => void;
  /** Whether the tab is hidden (`document.visibilityState`). */
  hidden(): boolean;
  /** Hears each change of the tab's visibility. Returns its removal. */
  onVisibilityChange(listener: () => void): () => void;
}

/** How often the loop wakes while the tab is hidden: about once a frame. */
export const HIDDEN_WAKE_MS = 1000 / 60;

/** The browser itself: `performance.now()`, animation frames, `worker-timers` and the document. */
export const browserClockPlatform: ClockPlatform = {
  now: () => performance.now(),
  requestFrame(callback) {
    const frame = requestAnimationFrame(() => callback());
    return () => cancelAnimationFrame(frame);
  },
  workerTimeout(callback, ms) {
    const timer = setWorkerTimeout(callback, ms);
    return () => clearWorkerTimeout(timer);
  },
  hidden: () => document.visibilityState === 'hidden',
  onVisibilityChange(listener) {
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
};

/**
 * The online session's clock (design §13.1, Online session; §8.4): `performance.now()`, waking the
 * loop at the next animation frame while the tab shows and from a Web Worker's timer
 * (`worker-timers`) while it's hidden. Browsers stop animation frames in a hidden tab and slow its
 * ordinary timers to about once a second, but not a worker's, so a match keeps stepping and sending
 * batches there. A wake waiting as the tab hides or shows moves over at once. The pings and the
 * reconnects' backoff (`after`) use worker timers too, hidden or not. Unlike the solo `RafClock`,
 * its time always runs: an online match starts at the server's `startAt`, not when the board shows.
 */
export function createOnlineClock(platform: ClockPlatform = browserClockPlatform): TimerClock {
  /** The callbacks waiting to wake. */
  let waiting = new Set<() => void>();
  let cancelRequest: (() => void) | null = null;
  let stopWatching: (() => void) | null = null;

  const wake = () => {
    cancelRequest = null;
    const due = waiting;
    waiting = new Set();
    for (const callback of due) callback();
    if (waiting.size === 0) {
      stopWatching?.();
      stopWatching = null;
    }
  };
  const request = () => {
    if (cancelRequest !== null || waiting.size === 0) return;
    cancelRequest = platform.hidden()
      ? platform.workerTimeout(wake, HIDDEN_WAKE_MS)
      : platform.requestFrame(wake);
    // A wake waiting as the tab hides or shows asks again the other way.
    stopWatching ??= platform.onVisibilityChange(() => {
      cancelRequest?.();
      cancelRequest = null;
      request();
    });
  };

  return {
    now: () => platform.now(),
    schedule(callback) {
      // A wrapper, so scheduling the same function twice wakes it twice.
      const call = () => callback();
      waiting.add(call);
      request();
      return () => {
        waiting.delete(call);
      };
    },
    after(ms, callback) {
      return platform.workerTimeout(callback, ms);
    },
  };
}
