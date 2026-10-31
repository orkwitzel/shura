import { MatchedListeners } from '../listeners';
import type { MatchQueue } from '../match-queue';
import { ExpiringMap } from './expiring';

/**
 * The quick-match queue in one process's memory. Each call reads and changes the queue without
 * awaiting in between, so it is atomic as the Valkey script is.
 */
export function createMemoryMatchQueue(now: () => number, cooldownMs: number): MatchQueue {
  let waiting: string[] = [];
  const cooldowns = new ExpiringMap<true>(now);
  const listeners = new MatchedListeners();
  return {
    async quickMatch(sessionId) {
      if (cooldowns.get(sessionId)) {
        return { status: 'coolingDown', retryAfterMs: cooldowns.ttl(sessionId) };
      }
      if (waiting.includes(sessionId)) return { status: 'alreadyQueued' };
      const partnerId = waiting.shift();
      if (partnerId !== undefined) return { status: 'matched', partnerId };
      waiting.push(sessionId);
      return { status: 'queued' };
    },
    async cancel(sessionId) {
      if (!waiting.includes(sessionId)) return false;
      waiting = waiting.filter((id) => id !== sessionId);
      cooldowns.set(sessionId, true, cooldownMs);
      return true;
    },
    async length() {
      return waiting.length;
    },
    async notifyMatched(notice) {
      const copy = { ...notice };
      // Delivered later, as a pub/sub message is, never inside the sender's call.
      queueMicrotask(() => listeners.dispatch(copy));
    },
    async onMatched(sessionId, listener) {
      const remove = listeners.add(sessionId, listener);
      return async () => remove();
    },
  };
}
