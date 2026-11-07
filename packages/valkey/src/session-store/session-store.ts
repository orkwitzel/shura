/** What the server keeps for one session: `session:{token}` (design §9.5, §10.2). */
export interface SessionRecord {
  sessionId: string;
  /** The nickname as the server normalised it. */
  nickname: string;
  /** The room the session is in, if any. */
  roomCode?: string;
}

/** The fields of a session that change. `roomCode: null` clears the room. */
export interface SessionUpdate {
  nickname?: string;
  roomCode?: string | null;
}

/**
 * Sessions by session token, so a client can reconnect to any gateway (design §10.2). Every call
 * that finds a session restarts its TTL (about 30 minutes): a session expires only when unused.
 */
export interface SessionStore {
  /** Stores a session under its token, replacing anything stored there. */
  create(token: string, session: SessionRecord): Promise<void>;
  get(token: string): Promise<SessionRecord | undefined>;
  /** Changes a session's nickname or room. Returns false if there is no such session. */
  update(token: string, update: SessionUpdate): Promise<boolean>;
  /** Restarts a session's TTL. Returns false if there is no such session. */
  touch(token: string): Promise<boolean>;
  delete(token: string): Promise<void>;
}
