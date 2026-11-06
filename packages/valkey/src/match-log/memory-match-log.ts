import type { MatchLog } from './match-log';

/**
 * Match logs in one process's memory. Entries are kept as JSON, as Valkey keeps them, so what
 * reads back is what was written, not a later change to it.
 */
export function createMemoryMatchLog(): MatchLog {
  const logs = new Map<string, { start: string; appends: { epoch: number; entry: string }[] }>();
  return {
    async start(matchId, start) {
      if (logs.has(matchId)) return false;
      logs.set(matchId, { start: JSON.stringify(start), appends: [] });
      return true;
    },
    async append(matchId, epoch, entry) {
      const log = logs.get(matchId);
      if (!log) return false;
      log.appends.push({ epoch, entry: JSON.stringify(entry) });
      return true;
    },
    async read(matchId) {
      const log = logs.get(matchId);
      if (!log) return undefined;
      return {
        start: JSON.parse(log.start),
        appends: log.appends.map(({ epoch, entry }) => ({ epoch, entry: JSON.parse(entry) })),
      };
    },
    async delete(matchId) {
      logs.delete(matchId);
    },
  };
}
