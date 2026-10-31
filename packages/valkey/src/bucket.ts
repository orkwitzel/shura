import type { TakeResult, TokenBucket } from './rate-limiter';

/** A bucket as stored: its tokens at time `at`. */
export interface BucketState {
  tokens: number;
  at: number;
}

/**
 * Refills a bucket up to `now` and takes `cost` tokens if it holds them: the in-memory version of
 * the Valkey limiter's Lua script, which does the same arithmetic. A missing bucket is full.
 * `ttlMs` is how long until it would be full again, when its key can go.
 */
export function refill(
  { capacity, refillPerSecond }: TokenBucket,
  stored: BucketState | undefined,
  now: number,
  cost: number,
): { take: TakeResult; state: BucketState; ttlMs: number } {
  const elapsed = stored ? Math.max(0, now - stored.at) : 0;
  let tokens = stored
    ? Math.min(capacity, stored.tokens + (elapsed * refillPerSecond) / 1000)
    : capacity;
  let take: TakeResult;
  if (tokens >= cost) {
    tokens -= cost;
    take = { allowed: true, remaining: Math.floor(tokens) };
  } else {
    take = { allowed: false, retryAfterMs: Math.ceil(((cost - tokens) * 1000) / refillPerSecond) };
  }
  const ttlMs = Math.max(1, Math.ceil(((capacity - tokens) * 1000) / refillPerSecond));
  return { take, state: { tokens, at: now }, ttlMs };
}
