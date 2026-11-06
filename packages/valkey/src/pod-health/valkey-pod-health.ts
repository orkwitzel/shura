import type { Redis } from 'iovalkey';
import type { ValkeyKeys } from '../shared/keys';
import type { PodHealth, PodHeartbeat } from './pod-health';

function toHeartbeat(hash: Record<string, string>): PodHeartbeat | undefined {
  const { podId, address, roomCount, engineVersion, draining } = hash;
  if (podId === undefined || address === undefined) return undefined;
  return {
    podId,
    address,
    roomCount: Number(roomCount),
    engineVersion: Number(engineVersion),
    draining: draining === '1',
  };
}

/**
 * Heartbeats in Valkey (design §9.5): one hash per pod, `pod:{id}`, expiring unless refreshed, and
 * the `pods` sorted set of pod ids scored by when their heartbeats expire, so listing them needs
 * no SCAN. The hash's own TTL is what counts: a pod in the set whose hash has gone isn't listed.
 */
export function createValkeyPodHealth(
  client: Redis,
  keys: ValkeyKeys,
  ttlMs: number,
  now: () => number,
): PodHealth {
  const get = async (podId: string) => toHeartbeat(await client.hgetall(keys.pod(podId)));
  return {
    async beat({ podId, address, roomCount, engineVersion, draining }) {
      const key = keys.pod(podId);
      const at = now();
      await client
        .multi()
        .hset(key, {
          podId,
          address,
          roomCount: String(roomCount),
          engineVersion: String(engineVersion),
          draining: draining ? '1' : '0',
        })
        .pexpire(key, ttlMs)
        .zadd(keys.pods, at + ttlMs, podId)
        // Pods that stopped beating leave the index on the next beat of any pod.
        .zremrangebyscore(keys.pods, '-inf', `(${at}`)
        .exec();
    },
    get,
    async list() {
      const podIds = await client.zrangebyscore(keys.pods, now(), '+inf');
      // Auto-pipelining sends the reads together.
      const heartbeats = await Promise.all(podIds.map(get));
      return heartbeats.filter((heartbeat) => heartbeat !== undefined);
    },
    async remove(podId) {
      await client.multi().del(keys.pod(podId)).zrem(keys.pods, podId).exec();
    },
  };
}
