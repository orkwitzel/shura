/** A token bucket's shape: `capacity` at once (the burst), refilling at `refillPerSecond`. */
export interface TokenBucket {
  capacity: number;
  refillPerSecond: number;
}

/** What a `take` did: the tokens left, or how long until enough have refilled. */
export type TakeResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };

/**
 * The abuse limits' counters that must hold across gateway pods (design §11): token buckets and
 * connection counts, by a key the caller picks (such as `ip:{address}` or `session:{id}`). Every
 * key expires on its own, so counters left behind by a crashed gateway don't last.
 */
export interface RateLimiter {
  /**
   * Takes `cost` tokens (1 by default, at most the capacity) from `key`'s bucket if it holds that
   * many. A bucket starts full, and its key expires once it would be full again.
   */
  take(key: string, bucket: TokenBucket, cost?: number): Promise<TakeResult>;
  /**
   * Counts one more under `key` if fewer than `limit` are counted, and restarts the count's TTL.
   * Returns false, counting nothing, at the limit.
   */
  acquire(key: string, limit: number, ttlMs: number): Promise<boolean>;
  /** Counts one fewer under `key`, never below zero. */
  release(key: string): Promise<void>;
  /** How many are counted under `key`. */
  count(key: string): Promise<number>;
}
