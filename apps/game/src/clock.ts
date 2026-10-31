/**
 * The game service's time source (design §14): `now()` and timers, injected so that tests drive
 * countdowns, room ticks, heartbeats and empty-room deletion with fake time.
 */
export interface ServerClock {
  /** Server time: milliseconds since the Unix epoch. */
  now(): number;
  /** Calls `callback` once, `ms` milliseconds from now. Returns a function that cancels it. */
  after(ms: number, callback: () => void): () => void;
  /** Calls `callback` every `ms` milliseconds. Returns a function that stops it. */
  every(ms: number, callback: () => void): () => void;
}

/** The real clock: `Date.now` and Node's timers. */
export const systemClock: ServerClock = {
  now: () => Date.now(),
  after(ms, callback) {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
  every(ms, callback) {
    const timer = setInterval(callback, ms);
    return () => clearInterval(timer);
  },
};
