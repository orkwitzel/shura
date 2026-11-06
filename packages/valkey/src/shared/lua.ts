import type { Redis } from 'iovalkey';

/**
 * A store's Lua scripts by command name: each runs atomically, with its first `numberOfKeys`
 * arguments as KEYS.
 */
export type LuaScripts = Readonly<
  Record<string, { readonly numberOfKeys: number; readonly lua: string }>
>;

/**
 * Adds `scripts` to `client` as commands of their names. iovalkey runs each by its SHA, and loads
 * it on first use or after a restart flushed the script cache. Each command's types are declared
 * next to its script, in a `declare module 'iovalkey'` block.
 */
export function defineScripts(client: Redis, scripts: LuaScripts): void {
  for (const [name, definition] of Object.entries(scripts)) client.defineCommand(name, definition);
}

/** The Lua scripts' results: Valkey turns Lua tables into arrays and numbers into integers. */
export type ScriptReply = null | number | string | ScriptReply[];

/**
 * Turns a flat `[field, value, field, value, …]` reply (as `HGETALL` in Lua, or a stream entry's
 * fields, gives) into a record.
 */
export function pairs(reply: ScriptReply): Record<string, string> {
  const record: Record<string, string> = {};
  if (!Array.isArray(reply)) return record;
  for (let i = 0; i + 1 < reply.length; i += 2) record[String(reply[i])] = String(reply[i + 1]);
  return record;
}
