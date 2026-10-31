import type { Redis } from 'iovalkey';
import type { ValkeyKeys } from '../keys';
import type { MatchLog, MatchLogEntry, MatchLogStart } from '../match-log';
import { script } from './script';

// ARGV: the start entry as JSON.
const start = script(`
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('XADD', KEYS[1], '*', 'type', 'start', 'data', ARGV[1])
return 1
`);

/**
 * Match logs in Valkey: one stream per match, `log:{matchId}` (design §9.5). Each stream entry
 * has a `type` (`start` or `entry`) and its `data` as JSON; appends also carry their `epoch`, so a
 * phase-2 fencing script can check it without parsing the data.
 */
export function createValkeyMatchLog(client: Redis, keys: ValkeyKeys): MatchLog {
  return {
    async start(matchId, entry) {
      return (await start(client, [keys.matchLog(matchId)], [JSON.stringify(entry)])) === 1;
    },
    async append(matchId, entry) {
      // NOMKSTREAM: an append to a log that doesn't exist must not create it.
      const id = await client.xadd(
        keys.matchLog(matchId),
        'NOMKSTREAM',
        '*',
        'type',
        'entry',
        'epoch',
        String(entry.epoch),
        'data',
        JSON.stringify(entry),
      );
      return id !== null;
    },
    async read(matchId) {
      const stream = await client.xrange(keys.matchLog(matchId), '-', '+');
      let first: MatchLogStart | undefined;
      const entries: MatchLogEntry[] = [];
      for (const [, fields] of stream) {
        const field = (name: string) => fields[fields.indexOf(name) + 1] as string;
        const data = JSON.parse(field('data'));
        if (field('type') === 'start') first = data;
        else entries.push(data);
      }
      return first && { start: first, entries };
    },
    async delete(matchId) {
      await client.del(keys.matchLog(matchId));
    },
  };
}
