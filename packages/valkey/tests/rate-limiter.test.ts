import { expect, test } from 'vitest';
import type { TokenBucket } from '../src/index';
import { describeStores } from './support/backends';

/** 3 at once, then one every 100 ms. */
const BUCKET: TokenBucket = { capacity: 3, refillPerSecond: 10 };
const COUNT_TTL = 300;

describeStores('RateLimiter', (harness) => {
  test('a bucket allows its burst, then refuses until a token refills', async () => {
    const { rateLimiter } = harness().stores;
    expect(await rateLimiter.take('ip:1', BUCKET)).toEqual({ allowed: true, remaining: 2 });
    expect(await rateLimiter.take('ip:1', BUCKET)).toEqual({ allowed: true, remaining: 1 });
    expect(await rateLimiter.take('ip:1', BUCKET)).toEqual({ allowed: true, remaining: 0 });
    expect(await rateLimiter.take('ip:1', BUCKET)).toEqual({ allowed: false, retryAfterMs: 100 });
  });

  test('tokens refill at the configured rate, from any gateway', async () => {
    const { stores, peer, advance } = harness();
    for (let i = 0; i < 3; i++) await stores.rateLimiter.take('ip:1', BUCKET);
    await advance(150);
    expect(await peer().rateLimiter.take('ip:1', BUCKET)).toEqual({ allowed: true, remaining: 0 });
    expect(await stores.rateLimiter.take('ip:1', BUCKET)).toEqual({
      allowed: false,
      retryAfterMs: 50,
    });
  });

  test('a bucket refills no higher than its capacity', async () => {
    const { stores, advance } = harness();
    await stores.rateLimiter.take('ip:1', BUCKET);
    await advance(1_000);
    for (let i = 0; i < 3; i++) {
      expect((await stores.rateLimiter.take('ip:1', BUCKET)).allowed).toBe(true);
    }
    expect((await stores.rateLimiter.take('ip:1', BUCKET)).allowed).toBe(false);
  });

  test('a take can cost several tokens', async () => {
    const { rateLimiter } = harness().stores;
    expect(await rateLimiter.take('ip:1', BUCKET, 2)).toEqual({ allowed: true, remaining: 1 });
    expect(await rateLimiter.take('ip:1', BUCKET, 2)).toEqual({
      allowed: false,
      retryAfterMs: 100,
    });
  });

  test('keys have separate buckets', async () => {
    const { rateLimiter } = harness().stores;
    for (let i = 0; i < 3; i++) await rateLimiter.take('ip:1', BUCKET);
    expect(await rateLimiter.take('ip:2', BUCKET)).toEqual({ allowed: true, remaining: 2 });
  });

  test('concurrent takes from several gateways never spend more than the burst', async () => {
    const { stores, peer } = harness();
    const gateways = [stores, peer(), peer()];
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (gateways[i % gateways.length] ?? stores).rateLimiter.take('ip:1', BUCKET),
      ),
    );
    expect(results.filter(({ allowed }) => allowed)).toHaveLength(3);
  });

  test('connections count up to the limit, and a release frees one', async () => {
    const { stores, peer } = harness();
    expect(await stores.rateLimiter.acquire('ip:1', 2, COUNT_TTL)).toBe(true);
    expect(await peer().rateLimiter.acquire('ip:1', 2, COUNT_TTL)).toBe(true);
    expect(await stores.rateLimiter.acquire('ip:1', 2, COUNT_TTL)).toBe(false);
    expect(await stores.rateLimiter.count('ip:1')).toBe(2);
    await peer().rateLimiter.release('ip:1');
    expect(await stores.rateLimiter.count('ip:1')).toBe(1);
    expect(await stores.rateLimiter.acquire('ip:1', 2, COUNT_TTL)).toBe(true);
  });

  test('a release with nothing counted leaves the count at zero', async () => {
    const { rateLimiter } = harness().stores;
    await rateLimiter.release('ip:1');
    expect(await rateLimiter.count('ip:1')).toBe(0);
    expect(await rateLimiter.acquire('ip:1', 1, COUNT_TTL)).toBe(true);
    expect(await rateLimiter.acquire('ip:1', 1, COUNT_TTL)).toBe(false);
  });

  test('a count expires after its TTL, and each acquire restarts it', async () => {
    const { stores, advance } = harness();
    const limiter = stores.rateLimiter;
    await limiter.acquire('ip:1', 5, COUNT_TTL);
    await advance(COUNT_TTL * 0.6);
    await limiter.acquire('ip:1', 5, COUNT_TTL);
    await advance(COUNT_TTL * 0.6);
    expect(await limiter.count('ip:1')).toBe(2);
    await advance(COUNT_TTL * 0.6);
    expect(await limiter.count('ip:1')).toBe(0);
  });

  test('a refresh restarts a count’s TTL without counting, and never brings one back', async () => {
    const { stores, peer, advance } = harness();
    const limiter = stores.rateLimiter;
    await limiter.acquire('ip:1', 5, COUNT_TTL);
    await advance(COUNT_TTL * 0.6);
    await peer().rateLimiter.refresh('ip:1', COUNT_TTL);
    await advance(COUNT_TTL * 0.6);
    expect(await limiter.count('ip:1')).toBe(1);
    await advance(COUNT_TTL * 0.6);
    expect(await limiter.count('ip:1')).toBe(0);
    await limiter.refresh('ip:1', COUNT_TTL);
    expect(await limiter.count('ip:1')).toBe(0);
  });

  test('concurrent acquires from several gateways never pass the limit', async () => {
    const { stores, peer } = harness();
    const gateways = [stores, peer(), peer()];
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (gateways[i % gateways.length] ?? stores).rateLimiter.acquire('ip:1', 5, COUNT_TTL),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(await stores.rateLimiter.count('ip:1')).toBe(5);
  });

  test('buckets and counts under one key are separate', async () => {
    const { rateLimiter } = harness().stores;
    await rateLimiter.acquire('ip:1', 5, COUNT_TTL);
    expect(await rateLimiter.take('ip:1', BUCKET)).toEqual({ allowed: true, remaining: 2 });
    expect(await rateLimiter.count('ip:1')).toBe(1);
  });
});
