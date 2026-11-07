import { LIMIT_DEFAULTS } from '@shura/protocol';
import { z } from 'zod';

/**
 * The numeric abuse limits the gateway takes from its environment (design §11), as
 * `LIMIT_DEFAULTS` documents them. "One hosted room per session" has no variable: it follows from
 * a session being in one room at a time.
 */
export type LimitName = Exclude<keyof typeof LIMIT_DEFAULTS, 'hostedRoomsPerSession'>;

/** The gateway's abuse limits (design §11), each from its own environment variable. */
export interface GatewayLimits extends Readonly<Record<LimitName, number>> {
  /** Addresses and CIDR ranges the per-IP limits don't apply to (`LIMITS_EXEMPT_IPS`). */
  readonly exemptIps: readonly string[];
  /** The peers whose `X-Forwarded-For` is believed (`TRUSTED_PROXIES`). */
  readonly trustedProxies: readonly string[];
}

/**
 * The injection token of the `GatewayLimits`: the `limits/` feature provides it from the config,
 * and anything that needs a limit (the spectator cap, the quick-match cooldown) injects it, so
 * tests set limits with `overrideProvider(LIMITS)`.
 */
export const LIMITS = Symbol('Limits');

/** Each numeric limit's environment variable, and the least it may be. Defaults: `LIMIT_DEFAULTS`. */
export const LIMIT_VARIABLES = {
  maxPayloadBytes: { name: 'MAX_PAYLOAD_BYTES', min: 1 },
  invalidMessagesBeforeDisconnect: { name: 'INVALID_MESSAGES_BEFORE_DISCONNECT', min: 1 },
  messagesPerSecond: { name: 'MESSAGES_PER_SECOND', min: 1 },
  messageBurst: { name: 'MESSAGE_BURST', min: 1 },
  connectionsPerIp: { name: 'CONNECTIONS_PER_IP', min: 0 },
  newConnectionsPerIpPerMinute: { name: 'NEW_CONNECTIONS_PER_IP_PER_MINUTE', min: 1 },
  roomsPerIpPerMinute: { name: 'ROOMS_PER_IP_PER_MINUTE', min: 1 },
  sessionsPerIpPerMinute: { name: 'SESSIONS_PER_IP_PER_MINUTE', min: 1 },
  failedJoinsPerIpPerMinute: { name: 'FAILED_JOINS_PER_IP_PER_MINUTE', min: 0 },
  maxSpectators: { name: 'MAX_SPECTATORS', min: 0 },
  quickMatchCooldownMs: { name: 'QUICK_MATCH_COOLDOWN_MS', min: 0 },
} as const satisfies Record<LimitName, { name: string; min: number }>;

type LimitVariable = (typeof LIMIT_VARIABLES)[LimitName]['name'];

const LIMIT_NAMES = Object.keys(LIMIT_VARIABLES) as LimitName[];

/** A whole number at least `min`, defaulting to `fallback`. */
const whole = (fallback: number, min: number) => z.coerce.number().int().min(min).default(fallback);

/** The limits' variables for the env schema, each a whole number with its default. */
export const limitVariables = Object.fromEntries(
  LIMIT_NAMES.map((limit) => {
    const { name, min } = LIMIT_VARIABLES[limit];
    return [name, whole(LIMIT_DEFAULTS[limit], min)];
  }),
) as Record<LimitVariable, ReturnType<typeof whole>>;

/** Comma-separated IP addresses and CIDR ranges, none by default. */
export const addressList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ''),
  )
  .pipe(z.array(z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()])));

/** The parsed variables the limits come from. */
type LimitEnv = Readonly<Record<LimitVariable, number>> & {
  readonly LIMITS_EXEMPT_IPS: readonly string[];
  readonly TRUSTED_PROXIES: readonly string[];
};

const LIMIT_ENV_NAMES: readonly (keyof LimitEnv)[] = [
  ...LIMIT_NAMES.map((limit) => LIMIT_VARIABLES[limit].name),
  'LIMITS_EXEMPT_IPS',
  'TRUSTED_PROXIES',
];

/** The limits in `@nestjs/config`'s validated environment, as the `LIMITS` token gives them. */
export const limitsFrom = (config: { get(name: keyof LimitEnv): unknown }): GatewayLimits =>
  limitsOf(Object.fromEntries(LIMIT_ENV_NAMES.map((name) => [name, config.get(name)])) as LimitEnv);

/** The parsed environment's limits, as the `LIMITS` token gives them. */
export const limitsOf = (env: LimitEnv): GatewayLimits => ({
  ...(Object.fromEntries(
    LIMIT_NAMES.map((limit) => [limit, env[LIMIT_VARIABLES[limit].name]]),
  ) as Record<LimitName, number>),
  exemptIps: env.LIMITS_EXEMPT_IPS,
  trustedProxies: env.TRUSTED_PROXIES,
});
