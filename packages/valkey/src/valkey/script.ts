import { createHash } from 'node:crypto';
import type { Redis } from 'iovalkey';

/** The Lua scripts' results: Valkey turns Lua tables into arrays and numbers into integers. */
export type ScriptReply = null | number | string | ScriptReply[];

/**
 * A Lua script run atomically by Valkey: by its SHA, loading it on first use or after a restart
 * flushed the script cache.
 */
export function script(lua: string) {
  const sha = createHash('sha1').update(lua).digest('hex');
  return async (
    client: Redis,
    keys: readonly string[],
    args: readonly (string | number)[] = [],
  ): Promise<ScriptReply> => {
    try {
      return (await client.evalsha(sha, keys.length, ...keys, ...args)) as ScriptReply;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('NOSCRIPT')) throw error;
      return (await client.eval(lua, keys.length, ...keys, ...args)) as ScriptReply;
    }
  };
}

/** Turns a flat `[field, value, field, value, …]` reply (as `HGETALL` in Lua gives) into a record. */
export function pairs(reply: ScriptReply): Record<string, string> {
  const record: Record<string, string> = {};
  if (!Array.isArray(reply)) return record;
  for (let i = 0; i + 1 < reply.length; i += 2) record[String(reply[i])] = String(reply[i + 1]);
  return record;
}
