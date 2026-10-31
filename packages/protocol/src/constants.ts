import type { RoomMode } from './messages';

// Timing and room constants that the clients, the gateway and the game service share (design §8,
// §10, §11). Durations in frames are game time (60 frames a second); durations in ms are on the
// server's clock.

/** How many frames ahead of the expected frame a batch may run (design §8.4): 6, 100 ms. */
export const CLOCK_LEAD_TOLERANCE = 6;

/**
 * How many frames behind the expected frame a batch may run before the player is in danger
 * (design §8.4): 1 s.
 */
export const CLOCK_BEHIND_WINDOW = 60;

/**
 * How far behind the expected frame a player may fall before they're lagged out (design §8.4).
 * It's also the window a player who disconnects mid-match has to come back in and carry on
 * (§10.2).
 */
export const LAG_OUT_MS = 3000;

/**
 * How many frames of the target's game time an attack may stay sent but not received and accepted
 * before the target is lagged out (design §8.5): 10 s.
 */
export const GARBAGE_ACK_TIMEOUT = 600;

/** The room tick (design §8.1): verified batches are relayed once per tick, 20 times a second. */
export const ROOM_TICK_MS = 50;

/** A client sends an input batch about every this many frames (design §8.1): ~20 a second. */
export const BATCH_FRAMES = 3;

/** The seats in a room of each mode (design §10.1). */
export const SEATS: Readonly<Record<RoomMode, number>> = { '1v1': 2, ffa: 8 };

/** The most spectators a room holds (design §10.1); a join beyond that gets `room_full`. */
export const MAX_SPECTATORS = 16;

/** How long a seat is held for a player who disconnects in the lobby (design §10.2). */
export const SEAT_HOLD_MS = 30_000;

/** How long an empty room lasts before it's deleted (design §10.1). */
export const EMPTY_ROOM_MS = 60_000;

/** The countdown before a match starts (design §10.1). */
export const COUNTDOWN_MS = 3000;

/**
 * The defaults of the abuse limits the gateway enforces (design §11). Each is an environment
 * variable of the gateway, which falls back to these.
 */
export const LIMIT_DEFAULTS = {
  /** The largest WebSocket message, in bytes. */
  maxPayloadBytes: 16 * 1024,
  /** Invalid messages on one connection before it's closed. */
  invalidMessagesBeforeDisconnect: 3,
  /** The per-connection token bucket's refill rate, in messages a second. */
  messagesPerSecond: 60,
  /** The per-connection token bucket's size. */
  messageBurst: 120,
  /** Concurrent connections from one IP. */
  connectionsPerIp: 10,
  /** New connections from one IP per minute. */
  newConnectionsPerIpPerMinute: 30,
  /** Rooms created from one IP per minute. */
  roomsPerIpPerMinute: 3,
  /** Rooms one session hosts at a time. */
  hostedRoomsPerSession: 1,
  /** Failed room joins from one IP per minute (room-code guessing). */
  failedJoinsPerIpPerMinute: 10,
  /** Spectators in one room. */
  maxSpectators: MAX_SPECTATORS,
  /** How long a session that left the quick-match queue waits before it can rejoin, in ms. */
  quickMatchCooldownMs: 3000,
} as const;
