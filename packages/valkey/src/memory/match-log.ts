import type { MatchLog } from '../match-log';

/**
 * Match logs in one process's memory. Entries are kept as JSON, as Valkey keeps them, so what
 * reads back is what was appended.
 */
export function createMemoryMatchLog(): MatchLog {
  const logs = new Map<string, { start: string; entries: string[] }>();
  return {
    async start(matchId, start) {
      if (logs.has(matchId)) return false;
      logs.set(matchId, { start: JSON.stringify(start), entries: [] });
      return true;
    },
    async append(matchId, entry) {
      const log = logs.get(matchId);
      if (!log) return false;
      log.entries.push(JSON.stringify(entry));
      return true;
    },
    async read(matchId) {
      const log = logs.get(matchId);
      if (!log) return undefined;
      return {
        start: JSON.parse(log.start),
        entries: log.entries.map((entry) => JSON.parse(entry)),
      };
    },
    async delete(matchId) {
      logs.delete(matchId);
    },
  };
}
