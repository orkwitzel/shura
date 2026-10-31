/**
 * The Valkey key layout (design §9.5). `prefix` is prepended to every key and channel: empty in
 * production, and a fresh one per test so tests can share one Valkey.
 */
export function valkeyKeys(prefix = '') {
  return {
    /** Hash: a room's pod address, epoch, mode, phase and host. Deleted with the room. */
    room: (code: string) => `${prefix}room:${code}`,
    /** Sorted set: the session ids waiting for a 1v1 quick-match, oldest first. */
    quickMatch: `${prefix}qm:1v1`,
    /** String: set while a session that left the queue must wait to rejoin it. */
    quickMatchCooldown: (sessionId: string) => `${prefix}qm:cooldown:${sessionId}`,
    /** Pub/sub channel: tells the waiting player's gateway that a pair formed. */
    quickMatchMatched: `${prefix}qm:matched`,
    /** Hash: a session's id, nickname and current room. Sliding TTL. */
    session: (token: string) => `${prefix}session:${token}`,
    /** Hash: a game pod's heartbeat. Expires unless refreshed. */
    pod: (podId: string) => `${prefix}pod:${podId}`,
    /** Pattern matching every pod's heartbeat key. */
    podPattern: `${prefix}pod:*`,
    /** Stream: a match's log. Deleted at match end. */
    matchLog: (matchId: string) => `${prefix}log:${matchId}`,
    /** Hash: one rate-limit token bucket. Expires once it would be full again. */
    rateBucket: (key: string) => `${prefix}rl:bucket:${key}`,
    /** Counter: one connection count. Expires unless counted again. */
    rateCount: (key: string) => `${prefix}rl:count:${key}`,
    /** Pattern matching every key under the prefix. */
    all: `${prefix}*`,
  };
}

export type ValkeyKeys = ReturnType<typeof valkeyKeys>;
