import { type ErrorCode, LIMIT_DEFAULTS, type ServerMessage } from '@shura/protocol';
import type { RateLimiter, Registry, TokenBucket } from '@shura/valkey';
import { type AddressList, addressList, normalizeIp } from './client-ip';
import type { ServerClock } from './clock';
import type { Logger } from './logger';
import type { Peer, PeerListeners } from './peer';

/** The gateway's abuse limits (design §11), each from its own environment variable. */
export interface GatewayLimits {
  readonly maxPayloadBytes: number;
  readonly invalidMessagesBeforeDisconnect: number;
  readonly messagesPerSecond: number;
  readonly messageBurst: number;
  readonly connectionsPerIp: number;
  readonly newConnectionsPerIpPerMinute: number;
  readonly roomsPerIpPerMinute: number;
  readonly hostedRoomsPerSession: number;
  readonly failedJoinsPerIpPerMinute: number;
  readonly maxSpectators: number;
  readonly quickMatchCooldownMs: number;
  /** Addresses and CIDR ranges the per-IP limits don't apply to. */
  readonly exemptIps: readonly string[];
  /** The peers whose `X-Forwarded-For` is believed. */
  readonly trustedProxies: readonly string[];
}

export const DEFAULT_LIMITS: GatewayLimits = {
  ...LIMIT_DEFAULTS,
  exemptIps: [],
  trustedProxies: [],
};

const MINUTE_MS = 60_000;

/**
 * How long an IP's connection count lasts after it was last counted or refreshed: each open
 * connection refreshes it twice as often, so the count outlives every connection it counts, yet a
 * count a crashed gateway left behind goes within this long.
 */
export const CONNECTION_COUNT_TTL_MS = 10 * MINUTE_MS;

/** A bucket of `perMinute` that refills evenly over a minute. */
const perMinute = (perMinute: number): TokenBucket => ({
  capacity: perMinute,
  refillPerSecond: perMinute / 60,
});

const error = (code: ErrorCode, message: string): ServerMessage => ({
  type: 'error',
  code,
  message,
});

export interface LimitsOptions {
  readonly limits: GatewayLimits;
  readonly rateLimiter: RateLimiter;
  readonly registry: Pick<Registry, 'get'>;
  readonly clock: ServerClock;
  readonly logger: Logger;
}

/**
 * The abuse limits (design §11). Per IP, counted in Valkey through `RateLimiter` so they hold
 * across gateway pods, and skipped for `LIMITS_EXEMPT_IPS`: connections, rooms created and failed
 * joins. Per connection, counted where the connection is, and never skipped: invalid messages and
 * the message-rate bucket. Per session: the rooms it hosts.
 */
export class Limits {
  readonly #options: LimitsOptions;
  readonly #exempt: AddressList;

  constructor(options: LimitsOptions) {
    this.#options = options;
    this.#exempt = addressList(options.limits.exemptIps);
  }

  /**
   * Lets a new connection from `ip` in if its IP is under the connection limits, and counts it
   * until it closes. Returns the peer the connection should use: messages that arrive while the
   * counts are checked wait, and a refused connection gets `too_many_connections` and is closed.
   */
  admit(socket: Peer, ip: string): Peer {
    if (this.#exempt.has(ip)) return socket;
    const address = normalizeIp(ip);
    const gate = new Gate(socket, this.#options.limits.messageBurst);
    this.#admit(address).then(
      (refusal) => {
        if (refusal) {
          this.#options.logger.info({ ip: address }, 'connection refused');
          return gate.refuse(JSON.stringify(refusal));
        }
        gate.open(this.#counted(address));
      },
      (cause: unknown) => {
        // Without Valkey there's nothing to count with: the connection goes in uncounted.
        this.#options.logger.error({ err: cause, ip: address }, 'connection limits failed');
        gate.open(() => {});
      },
    );
    return gate.peer;
  }

  /** The limits of one connection from `ip`. */
  connection(ip: string): ConnectionLimits {
    return new ConnectionLimits(this.#options, normalizeIp(ip), this.#exempt.has(ip));
  }

  async #admit(ip: string): Promise<ServerMessage | null> {
    const { limits, rateLimiter } = this.#options;
    const fresh = await rateLimiter.take(
      `ip:${ip}:new`,
      perMinute(limits.newConnectionsPerIpPerMinute),
    );
    const counted =
      fresh.allowed &&
      (await rateLimiter.acquire(
        `ip:${ip}:connections`,
        limits.connectionsPerIp,
        CONNECTION_COUNT_TTL_MS,
      ));
    return counted
      ? null
      : error('too_many_connections', 'Too many connections from your address. Try again soon.');
  }

  /** Keeps `ip`'s count of one connection alive. Returns what to do once it closes. */
  #counted(ip: string): () => void {
    const { rateLimiter, clock, logger } = this.#options;
    const key = `ip:${ip}:connections`;
    const failed = (cause: unknown) => logger.error({ err: cause, ip }, 'connection count failed');
    const stop = clock.every(CONNECTION_COUNT_TTL_MS / 2, () => {
      rateLimiter.refresh(key, CONNECTION_COUNT_TTL_MS).catch(failed);
    });
    return () => {
      stop();
      rateLimiter.release(key).catch(failed);
    };
  }
}

/** What a message arriving on a connection does to its rate bucket. */
export type MessageRate = 'allowed' | 'refused' | 'dropped';

/** The limits one connection is under (design §11). */
export class ConnectionLimits {
  readonly #options: LimitsOptions;
  readonly #ip: string;
  readonly #exempt: boolean;
  #tokens: number;
  #countedAt: number;
  /** Whether the last message was refused, so the next refusals go unanswered. */
  #refusing = false;
  #invalid = 0;

  constructor(options: LimitsOptions, ip: string, exempt: boolean) {
    this.#options = options;
    this.#ip = ip;
    this.#exempt = exempt;
    this.#tokens = options.limits.messageBurst;
    this.#countedAt = options.clock.now();
  }

  /**
   * Takes a message from the connection's token bucket. The first message refused in a row is
   * `refused` and gets `rate_limited`; the rest are `dropped` without an answer, so a flood isn't
   * answered with one.
   */
  message(): MessageRate {
    const { limits, clock } = this.#options;
    const now = clock.now();
    const refilled = ((now - this.#countedAt) * limits.messagesPerSecond) / 1000;
    this.#tokens = Math.min(limits.messageBurst, this.#tokens + refilled);
    this.#countedAt = now;
    if (this.#tokens >= 1) {
      this.#tokens -= 1;
      this.#refusing = false;
      return 'allowed';
    }
    if (this.#refusing) return 'dropped';
    this.#refusing = true;
    return 'refused';
  }

  /** The `rate_limited` a refused message gets. */
  readonly tooFast = error('rate_limited', 'Too many messages. Slow down.');

  /** Counts an invalid message. True once there have been enough to close the connection. */
  invalid(): boolean {
    this.#invalid++;
    return this.#invalid >= this.#options.limits.invalidMessagesBeforeDisconnect;
  }

  /**
   * Whether `sessionId` may create a room while in `roomCode` (null if in none): the error to
   * answer if not. A session is in one room at a time, so the room it hosts is the one it's in.
   * Out of a room, creating one takes from its IP's rooms a minute.
   */
  async createRoom(sessionId: string, roomCode: string | null): Promise<ServerMessage | null> {
    const { limits, registry, rateLimiter } = this.#options;
    const hosts = roomCode !== null && (await registry.get(roomCode))?.hostId === sessionId;
    if ((hosts ? 1 : 0) >= limits.hostedRoomsPerSession) {
      return error('room_limit', 'You already host a room.');
    }
    if (roomCode !== null || this.#exempt) return null;
    const take = await rateLimiter.take(
      `ip:${this.#ip}:rooms`,
      perMinute(limits.roomsPerIpPerMinute),
    );
    return take.allowed
      ? null
      : error('room_limit', 'Too many rooms created. Try again in a minute.');
  }

  /** Whether the connection may try a join: not once its IP has failed too many this minute. */
  async joinRoom(): Promise<ServerMessage | null> {
    if (this.#exempt) return null;
    const { limits, rateLimiter } = this.#options;
    const failed = await rateLimiter.count(`ip:${this.#ip}:failed-joins`);
    return failed < limits.failedJoinsPerIpPerMinute
      ? null
      : error('rate_limited', 'Too many wrong room codes. Try again in a minute.');
  }

  /**
   * Counts a join that found no room. The count lasts a minute from the last one counted, so a
   * guesser at the limit waits a minute.
   */
  async joinFailed(): Promise<void> {
    if (this.#exempt) return;
    const { limits, rateLimiter } = this.#options;
    await rateLimiter.acquire(
      `ip:${this.#ip}:failed-joins`,
      limits.failedJoinsPerIpPerMinute,
      MINUTE_MS,
    );
  }
}

/**
 * A socket held shut while its connection limits are checked: what arrives waits (up to `hold`
 * messages; the rest would only be rate-limited), then goes through once it's opened, or nowhere
 * if it's refused.
 */
class Gate {
  readonly #socket: Peer;
  readonly #hold: number;
  #state: 'waiting' | 'open' | 'refused' = 'waiting';
  #listeners: PeerListeners | null = null;
  #held: string[] = [];
  #closed = false;
  #closing: () => void = () => {};

  constructor(socket: Peer, hold: number) {
    this.#socket = socket;
    this.#hold = hold;
    socket.listen({
      message: (text) => {
        if (this.#state === 'open') this.#listeners?.message(text);
        else if (this.#state === 'waiting' && this.#held.length < this.#hold) this.#held.push(text);
      },
      close: () => {
        this.#closed = true;
        this.#closing();
        if (this.#state !== 'refused') this.#listeners?.close();
      },
    });
  }

  readonly peer: Peer = {
    send: (text) => {
      if (this.#state === 'open') this.#socket.send(text);
    },
    close: () => this.#socket.close(),
    listen: (listeners) => {
      this.#listeners = listeners;
      this.#flush();
    },
  };

  /** Lets the connection through; `closing` runs once it closes. */
  open(closing: () => void): void {
    this.#state = 'open';
    if (this.#closed) {
      closing();
      return;
    }
    this.#closing = closing;
    this.#flush();
  }

  refuse(text: string): void {
    this.#state = 'refused';
    this.#held = [];
    this.#socket.send(text);
    this.#socket.close();
  }

  #flush(): void {
    if (this.#state !== 'open' || !this.#listeners || this.#closed) return;
    const held = this.#held;
    this.#held = [];
    for (const text of held) this.#listeners.message(text);
  }
}
