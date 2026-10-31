import type { SessionRecord, SessionStore } from '../session-store';
import { ExpiringMap } from './expiring';

/** Sessions in one process's memory, expiring on the given clock. */
export function createMemorySessionStore(now: () => number, ttlMs: number): SessionStore {
  const sessions = new ExpiringMap<SessionRecord>(now);
  const find = (token: string) => {
    const session = sessions.get(token);
    if (session) sessions.expire(token, ttlMs);
    return session;
  };
  return {
    async create(token, session) {
      sessions.set(token, { ...session }, ttlMs);
    },
    async get(token) {
      const session = find(token);
      return session && { ...session };
    },
    async update(token, { nickname, roomCode }) {
      const session = find(token);
      if (!session) return false;
      if (nickname !== undefined) session.nickname = nickname;
      if (roomCode === null) delete session.roomCode;
      else if (roomCode !== undefined) session.roomCode = roomCode;
      return true;
    },
    async touch(token) {
      return find(token) !== undefined;
    },
    async delete(token) {
      sessions.delete(token);
    },
  };
}
