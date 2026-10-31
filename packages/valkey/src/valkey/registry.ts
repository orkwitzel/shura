import type { Redis } from 'iovalkey';
import type { ValkeyKeys } from '../keys';
import type { Registry, RoomMode, RoomPhase, RoomRecord } from '../registry';
import { pairs, script } from './script';

const create = script(`
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], unpack(ARGV))
return 1
`);

// ARGV: the new phase or '', then 'keep', 'clear' or 'set' for the host, then the new host.
const update = script(`
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
if ARGV[1] ~= '' then redis.call('HSET', KEYS[1], 'phase', ARGV[1]) end
if ARGV[2] == 'clear' then redis.call('HDEL', KEYS[1], 'hostId') end
if ARGV[2] == 'set' then redis.call('HSET', KEYS[1], 'hostId', ARGV[3]) end
return 1
`);

const reassign = script(`
if redis.call('EXISTS', KEYS[1]) == 0 then return nil end
redis.call('HSET', KEYS[1], 'podAddress', ARGV[1])
redis.call('HINCRBY', KEYS[1], 'epoch', 1)
return redis.call('HGETALL', KEYS[1])
`);

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
  if (hash.podAddress === undefined) return undefined;
  const room: RoomRecord = {
    podAddress: hash.podAddress,
    epoch: Number(hash.epoch),
    mode: hash.mode as RoomMode,
    phase: hash.phase as RoomPhase,
  };
  if (hash.hostId !== undefined) room.hostId = hash.hostId;
  return room;
}

/** The registry in Valkey: one hash per room, `room:{code}` (design §9.5). */
export function createValkeyRegistry(client: Redis, keys: ValkeyKeys): Registry {
  return {
    async create(code, room) {
      return (await create(client, [keys.room(code)], toFields(room))) === 1;
    },
    async get(code) {
      return toRoom(await client.hgetall(keys.room(code)));
    },
    async update(code, { phase, hostId }) {
      const host = hostId === null ? 'clear' : hostId === undefined ? 'keep' : 'set';
      return (await update(client, [keys.room(code)], [phase ?? '', host, hostId ?? ''])) === 1;
    },
    async reassign(code, podAddress) {
      return toRoom(pairs(await reassign(client, [keys.room(code)], [podAddress])));
    },
    async delete(code) {
      await client.del(keys.room(code));
    },
  };
}
