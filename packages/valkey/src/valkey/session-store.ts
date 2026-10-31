import type { Redis } from 'iovalkey';
import type { ValkeyKeys } from '../keys';
import type { SessionRecord, SessionStore } from '../session-store';
import { pairs, script } from './script';

// ARGV: the TTL in ms.
const get = script(`
local session = redis.call('HGETALL', KEYS[1])
if #session > 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return session
`);

// ARGV: the TTL in ms, the new nickname or '', then 'keep', 'clear' or 'set' and the new room.
const update = script(`
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
if ARGV[2] ~= '' then redis.call('HSET', KEYS[1], 'nickname', ARGV[2]) end
if ARGV[3] == 'clear' then redis.call('HDEL', KEYS[1], 'roomCode') end
if ARGV[3] == 'set' then redis.call('HSET', KEYS[1], 'roomCode', ARGV[4]) end
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return 1
`);

function toSession(hash: Record<string, string>): SessionRecord | undefined {
  if (hash.sessionId === undefined || hash.nickname === undefined) return undefined;
  const session: SessionRecord = { sessionId: hash.sessionId, nickname: hash.nickname };
  if (hash.roomCode !== undefined) session.roomCode = hash.roomCode;
  return session;
}

/** Sessions in Valkey: one hash per token, `session:{token}`, with a sliding TTL (design §9.5). */
export function createValkeySessionStore(
  client: Redis,
  keys: ValkeyKeys,
  ttlMs: number,
): SessionStore {
  return {
    async create(token, { sessionId, nickname, roomCode }) {
      const key = keys.session(token);
      const fields = ['sessionId', sessionId, 'nickname', nickname];
      if (roomCode !== undefined) fields.push('roomCode', roomCode);
      await client
        .multi()
        .del(key)
        .hset(key, ...fields)
        .pexpire(key, ttlMs)
        .exec();
    },
    async get(token) {
      return toSession(pairs(await get(client, [keys.session(token)], [ttlMs])));
    },
    async update(token, { nickname, roomCode }) {
      const room = roomCode === null ? 'clear' : roomCode === undefined ? 'keep' : 'set';
      const reply = await update(
        client,
        [keys.session(token)],
        [ttlMs, nickname ?? '', room, roomCode ?? ''],
      );
      return reply === 1;
    },
    async touch(token) {
      return (await client.pexpire(keys.session(token), ttlMs)) === 1;
    },
    async delete(token) {
      await client.del(keys.session(token));
    },
  };
}
