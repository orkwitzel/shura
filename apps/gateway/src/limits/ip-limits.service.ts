import { Inject, Injectable } from '@nestjs/common';
import { type ErrorBody, errorBody } from '@shura/protocol';
import type { Stores, TokenBucket } from '@shura/valkey';
import { type GatewayLimits, LIMITS, type LimitName } from '../config';
import { STORES } from '../valkey';
import { type AddressList, addressList, type ClientRequest, clientIp } from './client-ip';

const MINUTE_MS = 60_000;

/**
 * How long an IP's connection count lasts after it was last counted or refreshed. Each open
 * connection refreshes it twice as often, so the count outlives every connection it counts, yet a
 * count a crashed gateway left behind goes within this long.
 */
export const CONNECTION_COUNT_TTL_MS = 10 * MINUTE_MS;

/** A bucket of `perMinute` that refills evenly over a minute. */
const perMinute = (perMinute: number): TokenBucket => ({
  capacity: perMinute,
  refillPerSecond: perMinute / 60,
});

/**
 * A per-IP limit that `@RateLimit` puts on a route or a socket message: a token bucket every
 * request takes from, or a count of the requests that failed with `counts`, which refuses every
 * request once at its limit, until a minute after the last failure counted.
 */
type RateLimitPolicy = {
  /** Its part of the `RateLimiter` key, `ip:{address}:{name}` (design §9.5). */
  readonly name: string;
  readonly limit: LimitName;
  /** What a request over the limit gets. */
  readonly refusal: ErrorBody;
} & ({ readonly kind: 'bucket' } | { readonly kind: 'failures'; readonly counts: string });

/** The per-IP limits of design §11 that guard routes and socket messages, by `@RateLimit` key. */
export const RATE_LIMITS = {
  /** `POST /api/sessions`. */
  sessions: {
    kind: 'bucket',
    name: 'sessions',
    limit: 'sessionsPerIpPerMinute',
    refusal: errorBody('rate_limited', 'Too many new sessions from your address. Try again soon.'),
  },
  /** `createRoom`. */
  rooms: {
    kind: 'bucket',
    name: 'rooms',
    limit: 'roomsPerIpPerMinute',
    refusal: errorBody('room_limit'),
  },
  /** `joinRoom` and `GET /api/rooms/:code`: guessing room codes. */
  failedJoins: {
    kind: 'failures',
    name: 'failed-joins',
    limit: 'failedJoinsPerIpPerMinute',
    counts: 'room_not_found',
    refusal: errorBody('rate_limited', 'Too many wrong room codes. Try again in a minute.'),
  },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitKey = keyof typeof RATE_LIMITS;

/**
 * The per-IP limits (design §11): who the client is (`TRUSTED_PROXIES`), whether it's exempt
 * (`LIMITS_EXEMPT_IPS`), and its counts in the `RateLimiter`, which hold across gateway pods.
 * An exempt address is under none of them.
 */
@Injectable()
export class IpLimitsService {
  readonly #trusted: AddressList;
  readonly #exempt: AddressList;

  constructor(
    @Inject(LIMITS) private readonly limits: GatewayLimits,
    @Inject(STORES) private readonly stores: Stores,
  ) {
    this.#trusted = addressList(limits.trustedProxies);
    this.#exempt = addressList(limits.exemptIps);
  }

  /** The address of the client that sent `request`, through the trusted proxies. */
  ipOf(request: ClientRequest): string {
    return clientIp(request, this.#trusted);
  }

  isExempt(ip: string): boolean {
    return this.#exempt.has(ip);
  }

  /**
   * Counts a new connection from `ip` if it's under both connection limits (new a minute, and at
   * once). False, counting nothing at once, if not.
   */
  async admitConnection(ip: string): Promise<boolean> {
    const { newConnectionsPerIpPerMinute, connectionsPerIp } = this.limits;
    const { rateLimiter } = this.stores;
    const fresh = await rateLimiter.take(`ip:${ip}:new`, perMinute(newConnectionsPerIpPerMinute));
    return (
      fresh.allowed &&
      rateLimiter.acquire(connectionsKey(ip), connectionsPerIp, CONNECTION_COUNT_TTL_MS)
    );
  }

  /** Keeps a counted connection's count from expiring while it's open. */
  refreshConnection(ip: string): Promise<void> {
    return this.stores.rateLimiter.refresh(connectionsKey(ip), CONNECTION_COUNT_TTL_MS);
  }

  /** A counted connection closed. */
  releaseConnection(ip: string): Promise<void> {
    return this.stores.rateLimiter.release(connectionsKey(ip));
  }

  /** Whether `ip` may go on with a request under the limit `key`: the refusal if not. */
  async check(key: RateLimitKey, ip: string): Promise<ErrorBody | null> {
    if (this.isExempt(ip)) return null;
    const policy: RateLimitPolicy = RATE_LIMITS[key];
    const { rateLimiter } = this.stores;
    const limit = this.limits[policy.limit];
    const allowed =
      policy.kind === 'bucket'
        ? (await rateLimiter.take(policyKey(ip, policy), perMinute(limit))).allowed
        : (await rateLimiter.count(policyKey(ip, policy))) < limit;
    return allowed ? null : policy.refusal;
  }

  /** A request under the limit `key` failed with `code`: counted if that's what the limit counts. */
  async failed(key: RateLimitKey, ip: string, code: string): Promise<void> {
    const policy: RateLimitPolicy = RATE_LIMITS[key];
    if (policy.kind !== 'failures' || policy.counts !== code || this.isExempt(ip)) return;
    // The count lasts a minute from the last one counted, so a guesser at the limit waits a minute.
    await this.stores.rateLimiter.acquire(
      policyKey(ip, policy),
      this.limits[policy.limit],
      MINUTE_MS,
    );
  }
}

const connectionsKey = (ip: string) => `ip:${ip}:connections`;
const policyKey = (ip: string, { name }: RateLimitPolicy) => `ip:${ip}:${name}`;
