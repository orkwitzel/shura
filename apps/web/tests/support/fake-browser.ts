import type { ClockPlatform } from '@/lib/online-clock';

/**
 * A browser the test runs by hand: animation frames and worker timers fire only when it says, and
 * animation frames never while the tab is hidden, as browsers do.
 */
export function fakeBrowser() {
  let time = 0;
  let hidden = false;
  let frames: (() => void)[] = [];
  let timers: { at: number; callback: () => void }[] = [];
  const visibility = new Set<() => void>();
  const platform: ClockPlatform = {
    now: () => time,
    requestFrame(callback) {
      frames.push(callback);
      return () => {
        frames = frames.filter((other) => other !== callback);
      };
    },
    workerTimeout(callback, ms) {
      const timer = { at: time + ms, callback };
      timers.push(timer);
      return () => {
        timers = timers.filter((other) => other !== timer);
      };
    },
    hidden: () => hidden,
    onVisibilityChange(listener) {
      visibility.add(listener);
      return () => visibility.delete(listener);
    },
  };
  return {
    platform,
    /** Moves time on by `ms`, firing the worker timers due, then (if visible) the animation frames. */
    advance(ms: number) {
      time += ms;
      const due = timers.filter(({ at }) => at <= time);
      timers = timers.filter((timer) => !due.includes(timer));
      for (const { callback } of due) callback();
      if (!hidden) {
        const waiting = frames;
        frames = [];
        for (const callback of waiting) callback();
      }
    },
    setHidden(now: boolean) {
      hidden = now;
      for (const listener of [...visibility]) listener();
    },
    get frames() {
      return frames.length;
    },
    get timers() {
      return timers.length;
    },
  };
}
