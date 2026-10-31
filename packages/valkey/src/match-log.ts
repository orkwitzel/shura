/**
 * A match log's first entry, written at match start (design §9.6). The fields hold whatever the
 * game service puts there, which must survive a JSON round trip.
 */
export interface MatchLogStart {
  seed: number;
  /** The mode settings. */
  settings: unknown;
  /** The players, in their engine order. */
  players: readonly unknown[];
}

/** One append: a room's newly verified batches and garbage routings since the last one. */
export interface MatchLogEntry {
  /** The epoch of the game pod that wrote it (design §9.3). */
  epoch: number;
  batches: readonly unknown[];
  routings: readonly unknown[];
}

/** A match log as read back: the start entry, then every append in order. */
export interface MatchLogRecord {
  start: MatchLogStart;
  entries: MatchLogEntry[];
}

/**
 * The complete record of every running match, `log:{matchId}` (design §9.6, ADR 0007): no
 * checkpoints and no trimming, deleted at match end.
 */
export interface MatchLog {
  /** Writes the start entry. Returns false, changing nothing, if the match already has a log. */
  start(matchId: string, start: MatchLogStart): Promise<boolean>;
  /**
   * Appends an entry. Returns false if the match has no log: never started, or already deleted.
   * Appends made one after another, without waiting, are kept in that order.
   */
  append(matchId: string, entry: MatchLogEntry): Promise<boolean>;
  read(matchId: string): Promise<MatchLogRecord | undefined>;
  delete(matchId: string): Promise<void>;
}
