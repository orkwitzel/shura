/** What a `quickMatch` request did (design §9.4). */
export type QuickMatchResult =
  /** Paired with the player who has waited longest, who left the queue. */
  | { status: 'matched'; partnerId: string }
  /** Nobody was waiting: the session waits in the queue. */
  | { status: 'queued' }
  /** The session was already waiting. Nothing changed. */
  | { status: 'alreadyQueued' }
  /** The session left the queue too recently to rejoin it yet. */
  | { status: 'coolingDown'; retryAfterMs: number };

/** The message that tells a waiting player's gateway its player has been paired. */
export interface MatchedNotice {
  /** The waiting player's session id. */
  sessionId: string;
  /** Who they were paired with. */
  partnerId: string;
  /** The quick-match room the pairing gateway created for them. */
  roomCode: string;
}

/**
 * The 1v1 quick-match queue shared by every gateway (design §9.4): `qm:1v1`, oldest first, with
 * one entry per session.
 */
export interface MatchQueue {
  /**
   * In one atomic step, pops the longest-waiting partner or, if nobody is waiting, enqueues the
   * session: two requests at once never pop the same partner.
   */
  quickMatch(sessionId: string): Promise<QuickMatchResult>;
  /**
   * Takes the session out of the queue and starts its requeue cooldown. Returns false, starting
   * no cooldown, if it wasn't waiting.
   */
  cancel(sessionId: string): Promise<boolean>;
  /** How many sessions are waiting. */
  length(): Promise<number>;
  /** Tells the waiting player's gateway, wherever it is, that its player has been paired. */
  notifyMatched(notice: MatchedNotice): Promise<void>;
  /**
   * Calls `listener` with every notice for `sessionId`, from any gateway, until the returned
   * function is called. Notices sent once this resolves are heard.
   */
  onMatched(
    sessionId: string,
    listener: (notice: MatchedNotice) => void,
  ): Promise<() => Promise<void>>;
}
