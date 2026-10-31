import { randomUUID } from 'node:crypto';
import Valkey from 'iovalkey';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createValkeyStores, type Stores } from '../src/index';

// The key layout is what operators read in Valkey (design §9.5), so it's checked key by key.
const url = process.env.VALKEY_URL;

describe.skipIf(!url)('the Valkey key layout', () => {
  const prefix = `test:${randomUUID()}:`;
  let stores: Stores;
  let raw: Valkey;

  beforeAll(() => {
    stores = createValkeyStores(url ?? '', { prefix });
    raw = new Valkey(url ?? '');
  });

  afterAll(async () => {
    const found = await raw.keys(`${prefix}*`);
    if (found.length > 0) await raw.del(...found);
    await Promise.all([stores.close(), raw.quit()]);
  });

  const expectKey = async (key: string, type: string) => {
    expect(await raw.type(`${prefix}${key}`)).toBe(type);
    return raw.pttl(`${prefix}${key}`);
  };

  test('rooms are hashes with no TTL', async () => {
    await stores.registry.create('K7QX', {
      podAddress: 'game:8081',
      epoch: 1,
      mode: 'ffa',
      phase: 'lobby',
      hostId: 'a',
    });
    expect(await expectKey('room:K7QX', 'hash')).toBe(-1);
    expect(await raw.hgetall(`${prefix}room:K7QX`)).toEqual({
      podAddress: 'game:8081',
      epoch: '1',
      mode: 'ffa',
      phase: 'lobby',
      hostId: 'a',
    });
  });

  test('the quick-match queue is a list and a cooldown expires', async () => {
    await stores.matchQueue.quickMatch('a');
    expect(await expectKey('qm:1v1', 'list')).toBe(-1);
    await stores.matchQueue.cancel('a');
    expect(await expectKey('qm:cooldown:a', 'string')).toBeGreaterThan(0);
  });

  test('sessions are hashes with a TTL of about 30 minutes', async () => {
    await stores.sessions.create('token', { sessionId: 'a', nickname: 'Noa' });
    const ttl = await expectKey('session:token', 'hash');
    expect(ttl).toBeGreaterThan(29 * 60_000);
    expect(ttl).toBeLessThanOrEqual(30 * 60_000);
  });

  test('heartbeats are hashes with a TTL of 5 s', async () => {
    await stores.podHealth.beat({
      podId: 'game-1',
      address: 'game:8081',
      roomCount: 0,
      engineVersion: 2,
      draining: false,
    });
    const ttl = await expectKey('pod:game-1', 'hash');
    expect(ttl).toBeGreaterThan(4_000);
    expect(ttl).toBeLessThanOrEqual(5_000);
  });

  test('match logs are streams with no TTL', async () => {
    await stores.matchLog.start('match-1', { seed: 1, settings: {}, players: [] });
    expect(await expectKey('log:match-1', 'stream')).toBe(-1);
  });

  test('a bucket expires once it would be full again, and a count after its TTL', async () => {
    const bucket = { capacity: 30, refillPerSecond: 0.5 };
    await stores.rateLimiter.take('ip:1', bucket, 3);
    const ttl = await expectKey('rl:bucket:ip:1', 'hash');
    expect(ttl).toBeGreaterThan(5_000);
    expect(ttl).toBeLessThanOrEqual(6_000);
    await stores.rateLimiter.acquire('ip:1', 10, 60_000);
    expect(await expectKey('rl:count:ip:1', 'string')).toBeGreaterThan(59_000);
  });
});
