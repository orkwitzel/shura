import { expect, test } from 'vitest';
import type { PodHeartbeat } from '../src/index';
import { describeStores, TEST_OPTIONS } from './support/backends';

const TTL = TEST_OPTIONS.podTtlMs;

function heartbeat(podId: string, roomCount = 0): PodHeartbeat {
  return { podId, address: `${podId}:8081`, roomCount, engineVersion: 2, draining: false };
}

const byId = (a: PodHeartbeat, b: PodHeartbeat) => a.podId.localeCompare(b.podId);

describeStores('PodHealth', (harness) => {
  test('a heartbeat reads back from a gateway', async () => {
    const { stores, peer } = harness();
    await stores.podHealth.beat(heartbeat('game-1', 3));
    expect(await peer().podHealth.get('game-1')).toEqual(heartbeat('game-1', 3));
    expect(await peer().podHealth.get('game-2')).toBeUndefined();
  });

  test('every live pod is listed with its latest heartbeat', async () => {
    const { podHealth } = harness().stores;
    await podHealth.beat(heartbeat('game-1', 3));
    await podHealth.beat(heartbeat('game-2', 1));
    await podHealth.beat({ ...heartbeat('game-1', 4), draining: true });
    expect((await podHealth.list()).sort(byId)).toEqual([
      { ...heartbeat('game-1', 4), draining: true },
      heartbeat('game-2', 1),
    ]);
  });

  test('a pod that stops beating drops out after the TTL', async () => {
    const { stores, advance } = harness();
    await stores.podHealth.beat(heartbeat('game-1'));
    await stores.podHealth.beat(heartbeat('game-2'));
    await advance(TTL / 2);
    await stores.podHealth.beat(heartbeat('game-2'));
    await advance(TTL * 0.7);
    expect(await stores.podHealth.get('game-1')).toBeUndefined();
    expect(await stores.podHealth.list()).toEqual([heartbeat('game-2')]);
  });

  test('a removed pod is gone at once', async () => {
    const { podHealth } = harness().stores;
    await podHealth.beat(heartbeat('game-1'));
    await podHealth.remove('game-1');
    expect(await podHealth.list()).toEqual([]);
  });
});
