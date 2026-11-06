import type { ClientContext, Redis, RedisKey, Result } from 'iovalkey';
import type { ValkeyKeys } from '../shared/keys';
import { defineScripts } from '../shared/lua';
import { MatchedListeners } from './listeners';
import type { MatchedNotice, MatchQueue, QuickMatchResult } from './match-queue';

const SCRIPTS = {
  // KEYS: the queue, the session's cooldown. ARGV: the session id.
  queueMatch: {
    numberOfKeys: 2,
    lua: `
local wait = redis.call('PTTL', KEYS[2])
if wait > 0 then return {'coolingDown', wait} end
if redis.call('LPOS', KEYS[1], ARGV[1]) then return {'alreadyQueued'} end
local partner = redis.call('LPOP', KEYS[1])
if partner then return {'matched', partner} end
redis.call('RPUSH', KEYS[1], ARGV[1])
return {'queued'}
`,
  },
  // KEYS: the queue, the session's cooldown. ARGV: the session id, the cooldown in ms.
  queueCancel: {
    numberOfKeys: 2,
    lua: `
if redis.call('LREM', KEYS[1], 0, ARGV[1]) == 0 then return 0 end
redis.call('SET', KEYS[2], '1', 'PX', ARGV[2])
return 1
`,
  },
} as const;

declare module 'iovalkey' {
  interface RedisCommander<Context extends ClientContext = { type: 'default' }> {
    /** The status, then the partner's id or the cooldown's ms left, if the status has one. */
    queueMatch(
      queue: RedisKey,
      cooldown: RedisKey,
      sessionId: string,
    ): Result<[QuickMatchResult['status'], (number | string)?], Context>;
    queueCancel(
      queue: RedisKey,
      cooldown: RedisKey,
      sessionId: string,
      cooldownMs: number,
    ): Result<0 | 1, Context>;
  }
}

/** Reads a `qm:matched` message, or undefined if it isn't one: a bad message must not crash. */
function toNotice(message: string): MatchedNotice | undefined {
  try {
    const { sessionId, partnerId, roomCode } = JSON.parse(message) as Partial<MatchedNotice>;
    if (typeof sessionId !== 'string' || typeof partnerId !== 'string') return undefined;
    if (typeof roomCode !== 'string') return undefined;
    return { sessionId, partnerId, roomCode };
  } catch {
    return undefined;
  }
}

/**
 * The quick-match queue in Valkey (design §9.4, §9.5): a list, `qm:1v1`, oldest first, changed
 * only by Lua scripts so each request is atomic; a `qm:cooldown:{sessionId}` key per session that
 * just left; and the `qm:matched` pub/sub channel, which each process subscribes to once, on a
 * connection of its own, the first time it listens.
 */
export function createValkeyMatchQueue(
  client: Redis,
  keys: ValkeyKeys,
  cooldownMs: number,
): MatchQueue & { close(): Promise<void> } {
  defineScripts(client, SCRIPTS);
  const listeners = new MatchedListeners();
  let subscriber: { connection: Redis; ready: Promise<unknown> } | undefined;
  const subscribe = () => {
    if (subscriber) return subscriber.ready;
    const connection = client.duplicate();
    connection.on('message', (_channel: string, message: string) => {
      const notice = toNotice(message);
      if (notice) listeners.dispatch(notice);
    });
    subscriber = { connection, ready: connection.subscribe(keys.quickMatchMatched) };
    return subscriber.ready;
  };
  const cooldown = (sessionId: string) => keys.quickMatchCooldown(sessionId);
  return {
    async quickMatch(sessionId) {
      const [status, value] = await client.queueMatch(
        keys.quickMatch,
        cooldown(sessionId),
        sessionId,
      );
      if (status === 'matched') return { status, partnerId: String(value) };
      if (status === 'coolingDown') return { status, retryAfterMs: Number(value) };
      return { status };
    },
    async cancel(sessionId) {
      const cancelled = await client.queueCancel(
        keys.quickMatch,
        cooldown(sessionId),
        sessionId,
        cooldownMs,
      );
      return cancelled === 1;
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
