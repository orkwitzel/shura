import { refill } from '../bucket';
import type { RateLimiter } from '../rate-limiter';
import { ExpiringMap } from './expiring';

/** Buckets and counts in one process's memory, expiring on the given clock. */
export function createMemoryRateLimiter(now: () => number): RateLimiter {
  const buckets = new ExpiringMap<{ tokens: number; at: number }>(now);
  const counts = new ExpiringMap<number>(now);
  return {
    async take(key, bucket, cost = 1) {
      const result = refill(bucket, buckets.get(key), now(), cost);
      buckets.set(key, result.state, result.ttlMs);
      return result.take;
    },
    async acquire(key, limit, ttlMs) {
      const count = counts.get(key) ?? 0;
      if (count >= limit) return false;
      counts.set(key, count + 1, ttlMs);
      return true;
    },
    async refresh(key, ttlMs) {
      counts.expire(key, ttlMs);
    },
    async release(key) {
      const count = counts.get(key) ?? 0;
      if (count <= 1) counts.delete(key);
      else counts.set(key, count - 1, counts.ttl(key));
    },
    async count(key) {
      return counts.get(key) ?? 0;
    },
  };
}
