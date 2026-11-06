import { ExpiringMap } from '../shared/expiring-map';
import type { PodHealth, PodHeartbeat } from './pod-health';

/** Heartbeats in one process's memory, expiring on the given clock. */
export function createMemoryPodHealth(now: () => number, ttlMs: number): PodHealth {
  const pods = new ExpiringMap<PodHeartbeat>(now);
  return {
    async beat(heartbeat) {
      pods.set(heartbeat.podId, { ...heartbeat }, ttlMs);
    },
    async get(podId) {
      const heartbeat = pods.get(podId);
      return heartbeat && { ...heartbeat };
    },
    async list() {
      return pods.keys().flatMap((podId) => {
        const heartbeat = pods.get(podId);
        return heartbeat ? [{ ...heartbeat }] : [];
      });
    },
    async remove(podId) {
      pods.delete(podId);
    },
  };
}
