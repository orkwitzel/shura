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

  /** Checks `key`'s type and returns its TTL in ms (-1 for none). */
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

  test('the quick-match queue is a list, and a cooldown expires', async () => {
    await stores.matchQueue.quickMatch('a');
    expect(await expectKey('qm:1v1', 'list')).toBe(-1);
    await stores.matchQueue.cancel('a');
    const ttl = await expectKey('qm:cooldown:a', 'string');
    expect(ttl).toBeGreaterThan(2_000);
    expect(ttl).toBeLessThanOrEqual(3_000);
  });

  test('a pairing is published on qm:matched', async () => {
    const listener = raw.duplicate();
    const heard = new Promise<[string, string]>((resolve) => {
      listener.on('message', (channel: string, message: string) => resolve([channel, message]));
    });
    await listener.subscribe(`${prefix}qm:matched`);
    await stores.matchQueue.notifyMatched({ sessionId: 'a', partnerId: 'b', roomCode: 'QM22' });
    const [channel, message] = await heard;
    expect(channel).toBe(`${prefix}qm:matched`);
    expect(JSON.parse(message)).toEqual({ sessionId: 'a', partnerId: 'b', roomCode: 'QM22' });
    await listener.quit();
  });

  test('sessions are hashes with a TTL of about 30 minutes', async () => {
    await stores.sessions.create('token', { sessionId: 'a', nickname: 'Noa' });
    const ttl = await expectKey('session:token', 'hash');
    expect(ttl).toBeGreaterThan(29 * 60_000);
    expect(ttl).toBeLessThanOrEqual(30 * 60_000);
    expect(await raw.hgetall(`${prefix}session:token`)).toEqual({
      sessionId: 'a',
      nickname: 'Noa',
    });
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

  test('the pods are indexed in a sorted set by when their heartbeats expire', async () => {
    const before = Date.now();
    await stores.podHealth.beat({
      podId: 'game-2',
      address: 'game:8082',
      roomCount: 0,
      engineVersion: 2,
      draining: false,
    });
    expect(await expectKey('pods', 'zset')).toBe(-1);
    const expiresAt = Number(await raw.zscore(`${prefix}pods`, 'game-2'));
    expect(expiresAt).toBeGreaterThanOrEqual(before + 5_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 5_000);
    await stores.podHealth.remove('game-2');
    expect(await raw.zscore(`${prefix}pods`, 'game-2')).toBeNull();
  });

  test('match logs are streams with no TTL, each append tagged with its epoch', async () => {
    await stores.matchLog.start('match-1', { seed: 1, settings: {}, players: [] });
    await stores.matchLog.append('match-1', 3, { batches: [], routings: [] });
    expect(await expectKey('log:match-1', 'stream')).toBe(-1);
    const [first, second] = await raw.xrange(`${prefix}log:match-1`, '-', '+');
    expect(first?.[1]).toEqual(['type', 'start', 'data', '{"seed":1,"settings":{},"players":[]}']);
    expect(second?.[1]).toEqual([
      'type',
      'append',
      'epoch',
      '3',
      'data',
      '{"batches":[],"routings":[]}',
    ]);
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
