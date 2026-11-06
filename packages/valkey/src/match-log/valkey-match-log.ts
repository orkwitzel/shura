import type { ClientContext, Redis, RedisKey, Result } from 'iovalkey';
import type { ValkeyKeys } from '../shared/keys';
import { defineScripts, pairs } from '../shared/lua';
import type { MatchLog, MatchLogAppend } from './match-log';

const SCRIPTS = {
  // ARGV: the start entry as JSON.
  matchLogStart: {
    numberOfKeys: 1,
    lua: `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('XADD', KEYS[1], '*', 'type', 'start', 'data', ARGV[1])
return 1
`,
  },
} as const;

declare module 'iovalkey' {
  interface RedisCommander<Context extends ClientContext = { type: 'default' }> {
    matchLogStart(log: RedisKey, start: string): Result<0 | 1, Context>;
  }
}

/**
 * Match logs in Valkey: one stream per match, `log:{matchId}` (design §9.5). Each stream entry
 * has a `type` (`start` or `append`) and its `data` as JSON; appends also carry their `epoch` as a
 * field of its own, so a phase-2 fencing script can check it without parsing the data.
 */
export function createValkeyMatchLog(client: Redis, keys: ValkeyKeys): MatchLog {
  defineScripts(client, SCRIPTS);
  return {
    async start(matchId, start) {
      return (await client.matchLogStart(keys.matchLog(matchId), JSON.stringify(start))) === 1;
    },
    async append(matchId, epoch, entry) {
      // NOMKSTREAM: an append to a log that doesn't exist must not create it.
      const id = await client.xadd(
        keys.matchLog(matchId),
        'NOMKSTREAM',
        '*',
        'type',
        'append',
        'epoch',
        String(epoch),
        'data',
        JSON.stringify(entry),
      );
      return id !== null;
    },
    async read(matchId) {
      const stream = await client.xrange(keys.matchLog(matchId), '-', '+');
      let start: { value: unknown } | undefined;
      const appends: MatchLogAppend[] = [];
      for (const [, flat] of stream) {
        const { type, epoch, data = 'null' } = pairs(flat);
        if (type === 'start') start = { value: JSON.parse(data) };
        else appends.push({ epoch: Number(epoch), entry: JSON.parse(data) });
      }
      return start && { start: start.value, appends };
    },
    async delete(matchId) {
      await client.del(keys.matchLog(matchId));
    },
  };
}
