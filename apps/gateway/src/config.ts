import { hostname } from 'node:os';
import { LIMIT_DEFAULTS } from '@shura/protocol';
import { z } from 'zod';
import type { GatewayLimits } from './limits';

/** A whole number at least `min`, defaulting to `fallback`. */
const whole = (fallback: number, min = 0) => z.coerce.number().int().min(min).default(fallback);

/** Comma-separated IP addresses and CIDR ranges, empty by default. */
const addresses = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ''),
  )
  .pipe(z.array(z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()])));

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  VALKEY_URL: z.url().default('redis://localhost:6379'),
  /** Prepended to every Valkey key and channel, so several stacks can share one Valkey. */
  VALKEY_PREFIX: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** The pod's name in its logs (design §12). */
  POD_ID: z.string().min(1).default(hostname()),
  // The abuse limits (design §11).
  MAX_PAYLOAD_BYTES: whole(LIMIT_DEFAULTS.maxPayloadBytes, 1),
  INVALID_MESSAGES_BEFORE_DISCONNECT: whole(LIMIT_DEFAULTS.invalidMessagesBeforeDisconnect, 1),
  MESSAGES_PER_SECOND: whole(LIMIT_DEFAULTS.messagesPerSecond, 1),
  MESSAGE_BURST: whole(LIMIT_DEFAULTS.messageBurst, 1),
  CONNECTIONS_PER_IP: whole(LIMIT_DEFAULTS.connectionsPerIp),
  NEW_CONNECTIONS_PER_IP_PER_MINUTE: whole(LIMIT_DEFAULTS.newConnectionsPerIpPerMinute, 1),
  ROOMS_PER_IP_PER_MINUTE: whole(LIMIT_DEFAULTS.roomsPerIpPerMinute, 1),
  HOSTED_ROOMS_PER_SESSION: whole(LIMIT_DEFAULTS.hostedRoomsPerSession),
  FAILED_JOINS_PER_IP_PER_MINUTE: whole(LIMIT_DEFAULTS.failedJoinsPerIpPerMinute),
  MAX_SPECTATORS: whole(LIMIT_DEFAULTS.maxSpectators),
  QUICK_MATCH_COOLDOWN_MS: whole(LIMIT_DEFAULTS.quickMatchCooldownMs),
  /** Addresses the per-IP limits don't apply to (design §11). */
  LIMITS_EXEMPT_IPS: addresses,
  /** The peers whose `X-Forwarded-For` is believed (design §11). */
  TRUSTED_PROXIES: addresses,
});

type Env = z.infer<typeof schema>;

export interface Config
  extends Pick<Env, 'PORT' | 'VALKEY_URL' | 'VALKEY_PREFIX' | 'LOG_LEVEL' | 'POD_ID'> {
  readonly limits: GatewayLimits;
}

/** Reads and validates the environment. Exits with a readable error if it's invalid. */
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const result = schema.safeParse(env);
  if (!result.success) {
    console.error(`Invalid environment:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  const { data } = result;
  return {
    PORT: data.PORT,
    VALKEY_URL: data.VALKEY_URL,
    VALKEY_PREFIX: data.VALKEY_PREFIX,
    LOG_LEVEL: data.LOG_LEVEL,
    POD_ID: data.POD_ID,
    limits: {
      maxPayloadBytes: data.MAX_PAYLOAD_BYTES,
      invalidMessagesBeforeDisconnect: data.INVALID_MESSAGES_BEFORE_DISCONNECT,
      messagesPerSecond: data.MESSAGES_PER_SECOND,
      messageBurst: data.MESSAGE_BURST,
      connectionsPerIp: data.CONNECTIONS_PER_IP,
      newConnectionsPerIpPerMinute: data.NEW_CONNECTIONS_PER_IP_PER_MINUTE,
      roomsPerIpPerMinute: data.ROOMS_PER_IP_PER_MINUTE,
      hostedRoomsPerSession: data.HOSTED_ROOMS_PER_SESSION,
      failedJoinsPerIpPerMinute: data.FAILED_JOINS_PER_IP_PER_MINUTE,
      maxSpectators: data.MAX_SPECTATORS,
      quickMatchCooldownMs: data.QUICK_MATCH_COOLDOWN_MS,
      exemptIps: data.LIMITS_EXEMPT_IPS,
      trustedProxies: data.TRUSTED_PROXIES,
    },
  };
};
