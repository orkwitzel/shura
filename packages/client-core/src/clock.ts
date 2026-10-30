/**
 * The time source a game loop gets from its platform (design §13.1): the CLI's is
 * `performance.now()` with a ~4 ms timer, the web's `performance.now()` with
 * `requestAnimationFrame`, and tests' a fake clock they move by hand.
 */
export interface Clock {
  /** The time in milliseconds, from any fixed origin. It never goes backwards. */
  now(): number;
  /** Calls `callback` once, soon, to wake the loop. Returns a function that cancels the call. */
  schedule(callback: () => void): () => void;
}
