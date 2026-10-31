import type { Registry, RoomRecord } from '../registry';

/** The registry in one process's memory, for tests and single-process runs. */
export function createMemoryRegistry(): Registry {
  const rooms = new Map<string, RoomRecord>();
  return {
    async create(code, room) {
      if (rooms.has(code)) return false;
      rooms.set(code, { ...room });
      return true;
    },
    async get(code) {
      const room = rooms.get(code);
      return room && { ...room };
    },
    async update(code, { phase, hostId }) {
      const room = rooms.get(code);
      if (!room) return false;
      if (phase !== undefined) room.phase = phase;
      if (hostId === null) delete room.hostId;
      else if (hostId !== undefined) room.hostId = hostId;
      return true;
    },
    async reassign(code, podAddress) {
      const room = rooms.get(code);
      if (!room) return undefined;
      room.podAddress = podAddress;
      room.epoch += 1;
      return { ...room };
    },
    async delete(code) {
      rooms.delete(code);
    },
  };
}
