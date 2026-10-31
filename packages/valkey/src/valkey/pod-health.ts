import type { Redis } from 'iovalkey';
import type { ValkeyKeys } from '../keys';
import type { PodHealth, PodHeartbeat } from '../pod-health';

function toHeartbeat(hash: Record<string, string>): PodHeartbeat | undefined {
  if (hash.podId === undefined || hash.address === undefined) return undefined;
  return {
    podId: hash.podId,
    address: hash.address,
    roomCount: Number(hash.roomCount),
    engineVersion: Number(hash.engineVersion),
    draining: hash.draining === '1',
  };
}

/** Heartbeats in Valkey: one hash per pod, `pod:{id}`, expiring unless refreshed (design §9.5). */
export function createValkeyPodHealth(client: Redis, keys: ValkeyKeys, ttlMs: number): PodHealth {
  const get = async (key: string) => toHeartbeat(await client.hgetall(key));
  return {
    async beat({ podId, address, roomCount, engineVersion, draining }) {
      const key = keys.pod(podId);
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
        .exec();
    },
    get: (podId) => get(keys.pod(podId)),
    async list() {
      // A handful of pods: a SCAN over their keys is cheap, and needs no index to keep in step.
      const found: string[] = [];
      let cursor = '0';
      do {
        const [next, batch] = await client.scan(cursor, 'MATCH', keys.podPattern, 'COUNT', 100);
        found.push(...batch);
        cursor = next;
      } while (cursor !== '0');
      const heartbeats = await Promise.all([...new Set(found)].map(get));
      return heartbeats.filter((heartbeat) => heartbeat !== undefined);
    },
    async remove(podId) {
      await client.del(keys.pod(podId));
    },
  };
}
