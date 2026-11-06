/** One append, as read back: what was written, tagged with the epoch of the pod that wrote it. */
export interface MatchLogAppend {
  epoch: number;
  entry: unknown;
}

/** A match log as read back: the start entry, then every append in order. */
export interface MatchLogRecord {
  start: unknown;
  appends: MatchLogAppend[];
}

/**
 * The complete record of every running match, `log:{matchId}` (design §9.6, ADR 0007): no
 * checkpoints and no trimming, deleted at match end.
 *
 * The store keeps each entry as JSON and doesn't know its shape: the start entry is the seed, mode
 * settings and players, and each append the verified batches and garbage routings since the last
 * one. The game service writes them and parses what it reads back, with the schemas it owns.
 */
export interface MatchLog {
  /**
   * Writes the start entry (JSON-serialisable). Returns false, changing nothing, if the match
   * already has a log.
   */
  start(matchId: string, start: unknown): Promise<boolean>;
  /**
   * Appends an entry (JSON-serialisable), tagged with the writer's ownership epoch (design §9.3).
   * Returns false if the match has no log: never started, or already deleted. Appends made one
   * after another, without waiting, are kept in that order.
   */
  append(matchId: string, epoch: number, entry: unknown): Promise<boolean>;
  read(matchId: string): Promise<MatchLogRecord | undefined>;
  delete(matchId: string): Promise<void>;
}
