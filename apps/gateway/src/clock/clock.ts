/**
 * The service's time source (docs/design.md §14): `now()` and timers. Everything that reads time
 * injects it by the `CLOCK` token, so tests replace it with `overrideProvider(CLOCK)`.
 */
export interface Clock {
  /** Server time: milliseconds since the Unix epoch. */
  now(): number;
  /** Calls `callback` once, `ms` milliseconds from now. Returns a function that cancels it. */
  after(ms: number, callback: () => void): () => void;
  /** Calls `callback` every `ms` milliseconds. Returns a function that stops it. */
  every(ms: number, callback: () => void): () => void;
}

/** The injection token of the `Clock`. */
export const CLOCK = Symbol('Clock');

/** The real clock: `Date.now` and Node's timers. */
export const systemClock: Clock = {
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
