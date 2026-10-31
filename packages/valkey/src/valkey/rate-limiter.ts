import type { Redis } from 'iovalkey';
import type { ValkeyKeys } from '../keys';
import type { RateLimiter } from '../rate-limiter';
import { script } from './script';

// The same arithmetic as `refill` (../bucket.ts). Tokens are stored as strings, since Lua numbers
// returned to Valkey are cut to integers. ARGV: capacity, refill per second, now (ms), cost.
const take = script(`
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local stored = redis.call('HMGET', KEYS[1], 'tokens', 'at')
local tokens = capacity
if stored[1] then
  local elapsed = math.max(0, now - tonumber(stored[2]))
  tokens = math.min(capacity, tonumber(stored[1]) + elapsed * rate / 1000)
end
local allowed = 0
local value
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
  value = math.floor(tokens)
else
  value = math.ceil((cost - tokens) * 1000 / rate)
end
redis.call('HSET', KEYS[1], 'tokens', string.format('%.17g', tokens), 'at', ARGV[3])
redis.call('PEXPIRE', KEYS[1], math.max(1, math.ceil((capacity - tokens) * 1000 / rate)))
return {allowed, value}
`);

// ARGV: the limit, the TTL in ms.
const acquire = script(`
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= tonumber(ARGV[1]) then return 0 end
redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`);

const release = script(`
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
if redis.call('DECR', KEYS[1]) <= 0 then redis.call('DEL', KEYS[1]) end
return 1
`);

/**
 * Buckets and counts in Valkey (design §9.5, §11): a hash per bucket, `rl:bucket:{key}`, and a
 * counter per count, `rl:count:{key}`, each changed only by a Lua script. Buckets refill on the
 * gateway's clock, passed in, so every pod must keep its clock in sync (NTP), as it must anyway.
 */
export function createValkeyRateLimiter(
  client: Redis,
  keys: ValkeyKeys,
  now: () => number,
): RateLimiter {
  return {
    async take(key, { capacity, refillPerSecond }, cost = 1) {
      const [allowed, value] = (await take(
        client,
        [keys.rateBucket(key)],
        [capacity, refillPerSecond, now(), cost],
      )) as [number, number];
      return allowed === 1
        ? { allowed: true, remaining: value }
        : { allowed: false, retryAfterMs: value };
    },
    async acquire(key, limit, ttlMs) {
      return (await acquire(client, [keys.rateCount(key)], [limit, ttlMs])) === 1;
    },
    async release(key) {
      await release(client, [keys.rateCount(key)]);
    },
    async count(key) {
      return Number((await client.get(keys.rateCount(key))) ?? 0);
    },
  };
}
