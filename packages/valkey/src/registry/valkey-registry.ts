import type { ClientContext, Redis, RedisKey, Result } from 'iovalkey';
import type { ValkeyKeys } from '../shared/keys';
import { defineScripts, pairs, type ScriptReply } from '../shared/lua';
import type { Registry, RoomRecord } from './registry';

const SCRIPTS = {
  // ARGV: the room's fields and values.
  registryCreate: {
    numberOfKeys: 1,
    lua: `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], unpack(ARGV))
return 1
`,
  },
  // ARGV: the new phase or '', then 'keep', 'clear' or 'set' for the host, then the new host.
  registryUpdate: {
    numberOfKeys: 1,
    lua: `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
if ARGV[1] ~= '' then redis.call('HSET', KEYS[1], 'phase', ARGV[1]) end
if ARGV[2] == 'clear' then redis.call('HDEL', KEYS[1], 'hostId') end
if ARGV[2] == 'set' then redis.call('HSET', KEYS[1], 'hostId', ARGV[3]) end
return 1
`,
  },
  // ARGV: the new owner's address.
  registryReassign: {
    numberOfKeys: 1,
    lua: `
if redis.call('EXISTS', KEYS[1]) == 0 then return nil end
redis.call('HSET', KEYS[1], 'podAddress', ARGV[1])
redis.call('HINCRBY', KEYS[1], 'epoch', 1)
return redis.call('HGETALL', KEYS[1])
`,
  },
} as const;

declare module 'iovalkey' {
  interface RedisCommander<Context extends ClientContext = { type: 'default' }> {
    registryCreate(room: RedisKey, ...fields: string[]): Result<0 | 1, Context>;
    registryUpdate(
      room: RedisKey,
      phase: string,
      host: 'keep' | 'clear' | 'set',
      hostId: string,
    ): Result<0 | 1, Context>;
    registryReassign(room: RedisKey, podAddress: string): Result<ScriptReply, Context>;
  }
}

function toFields(room: RoomRecord): string[] {
  const fields = [
    'podAddress',
    room.podAddress,
    'epoch',
    String(room.epoch),
    'mode',
    room.mode,
    'phase',
    room.phase,
  ];
  if (room.hostId !== undefined) fields.push('hostId', room.hostId);
  return fields;
}

function toRoom(hash: Record<string, string>): RoomRecord | undefined {
  const { podAddress, epoch, mode, phase, hostId } = hash;
  if (podAddress === undefined || mode === undefined || phase === undefined) return undefined;
  const room: RoomRecord = { podAddress, epoch: Number(epoch), mode, phase };
  if (hostId !== undefined) room.hostId = hostId;
  return room;
}

/** The registry in Valkey: one hash per room, `room:{code}` (design §9.5). */
export function createValkeyRegistry(client: Redis, keys: ValkeyKeys): Registry {
  defineScripts(client, SCRIPTS);
  return {
    async create(code, room) {
      return (await client.registryCreate(keys.room(code), ...toFields(room))) === 1;
    },
    async get(code) {
      return toRoom(await client.hgetall(keys.room(code)));
    },
    async update(code, { phase, hostId }) {
      const host = hostId === null ? 'clear' : hostId === undefined ? 'keep' : 'set';
      return (await client.registryUpdate(keys.room(code), phase ?? '', host, hostId ?? '')) === 1;
    },
    async reassign(code, podAddress) {
      return toRoom(pairs(await client.registryReassign(keys.room(code), podAddress)));
    },
    async delete(code) {
      await client.del(keys.room(code));
    },
  };
}
