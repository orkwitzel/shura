import type { Redis } from 'iovalkey';
import type { ValkeyKeys } from '../keys';
import { MatchedListeners } from '../listeners';
import type { MatchedNotice, MatchQueue, QuickMatchResult } from '../match-queue';
import { script } from './script';

// KEYS: the queue, the session's cooldown. ARGV: the session id.
const quickMatch = script(`
local wait = redis.call('PTTL', KEYS[2])
if wait > 0 then return {'coolingDown', wait} end
if redis.call('LPOS', KEYS[1], ARGV[1]) then return {'alreadyQueued'} end
local partner = redis.call('LPOP', KEYS[1])
if partner then return {'matched', partner} end
redis.call('RPUSH', KEYS[1], ARGV[1])
return {'queued'}
`);

// KEYS: the queue, the session's cooldown. ARGV: the session id, the cooldown in ms.
const cancel = script(`
if redis.call('LREM', KEYS[1], 0, ARGV[1]) == 0 then return 0 end
redis.call('SET', KEYS[2], '1', 'PX', ARGV[2])
return 1
`);

/**
 * The quick-match queue in Valkey (design §9.4, §9.5): a list, `qm:1v1`, oldest first, changed
 * only by Lua scripts so each request is atomic; a `qm:cooldown:{sessionId}` key per session that
 * just left; and the `qm:matched` pub/sub channel, which every gateway subscribes to once.
 */
export function createValkeyMatchQueue(
  client: Redis,
  keys: ValkeyKeys,
  cooldownMs: number,
): MatchQueue & { close(): Promise<void> } {
  const listeners = new MatchedListeners();
  let subscriber: { connection: Redis; ready: Promise<unknown> } | undefined;
  const subscribe = () => {
    if (subscriber) return subscriber.ready;
    const connection = client.duplicate();
    connection.on('message', (_channel: string, message: string) => {
      listeners.dispatch(JSON.parse(message) as MatchedNotice);
    });
    subscriber = { connection, ready: connection.subscribe(keys.quickMatchMatched) };
    return subscriber.ready;
  };
  const keysFor = (sessionId: string) => [keys.quickMatch, keys.quickMatchCooldown(sessionId)];
  return {
    async quickMatch(sessionId) {
      const [status, value] = (await quickMatch(client, keysFor(sessionId), [sessionId])) as [
        QuickMatchResult['status'],
        (number | string)?,
      ];
      if (status === 'matched') return { status, partnerId: String(value) };
      if (status === 'coolingDown') return { status, retryAfterMs: Number(value) };
      return { status };
    },
    async cancel(sessionId) {
      return (await cancel(client, keysFor(sessionId), [sessionId, cooldownMs])) === 1;
    },
    length: () => client.llen(keys.quickMatch),
    async notifyMatched({ sessionId, partnerId, roomCode }) {
      await client.publish(
        keys.quickMatchMatched,
        JSON.stringify({ sessionId, partnerId, roomCode }),
      );
    },
    async onMatched(sessionId, listener) {
      const remove = listeners.add(sessionId, listener);
      await subscribe();
      return async () => remove();
    },
    async close() {
      await subscriber?.connection.quit();
      subscriber = undefined;
    },
  };
}
