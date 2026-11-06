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
  // ARGV: the new phase or '', then 'keep', 'clear' or 'set' for the host, then the new host, then
  // the seated and spectator counts or ''.
  registryUpdate: {
    numberOfKeys: 1,
    lua: `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
if ARGV[1] ~= '' then redis.call('HSET', KEYS[1], 'phase', ARGV[1]) end
if ARGV[2] == 'clear' then redis.call('HDEL', KEYS[1], 'hostId') end
if ARGV[2] == 'set' then redis.call('HSET', KEYS[1], 'hostId', ARGV[3]) end
if ARGV[4] ~= '' then redis.call('HSET', KEYS[1], 'seated', ARGV[4]) end
if ARGV[5] ~= '' then redis.call('HSET', KEYS[1], 'spectators', ARGV[5]) end
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
      seated: string,
      spectators: string,
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
    'seated',
    String(room.seated),
    'spectators',
    String(room.spectators),
  ];
  if (room.hostId !== undefined) fields.push('hostId', room.hostId);
  if (room.quickMatch) fields.push('quickMatch', '1');
  return fields;
}

function toRoom(hash: Record<string, string>): RoomRecord | undefined {
  const { podAddress, epoch, mode, phase, hostId, quickMatch, seated, spectators } = hash;
  if (podAddress === undefined || mode === undefined || phase === undefined) return undefined;
  const room: RoomRecord = {
    podAddress,
    epoch: Number(epoch),
    mode,
    phase,
    seated: Number(seated ?? 0),
    spectators: Number(spectators ?? 0),
  };
  if (hostId !== undefined) room.hostId = hostId;
  if (quickMatch !== undefined) room.quickMatch = true;
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
    async update(code, { phase, hostId, seated, spectators }) {
      const host = hostId === null ? 'clear' : hostId === undefined ? 'keep' : 'set';
      const reply = await client.registryUpdate(
        keys.room(code),
        phase ?? '',
        host,
        hostId ?? '',
        seated === undefined ? '' : String(seated),
        spectators === undefined ? '' : String(spectators),
      );
      return reply === 1;
    },
    async reassign(code, podAddress) {
      return toRoom(pairs(await client.registryReassign(keys.room(code), podAddress)));
    },
    async delete(code) {
      await client.del(keys.room(code));
    },
  };
}
