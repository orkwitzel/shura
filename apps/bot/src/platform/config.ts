import { z } from 'zod';

/** The bot tool's environment, validated at startup (design §13.4). */
const schema = z.object({
  /**
   * `development` (set by the `serve` script) pretty-prints the logs with `pino-pretty`. Anything
   * else logs JSON, as the services do (design §12).
   */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  /** The bot tool's HTTP API (design §13.4). */
  BOT_PORT: z.coerce.number().int().min(1).max(65535).default(8090),
  /**
   * The gateway's HTTP origin, which bots connect to like any client: sessions under `/api`, the
   * WebSocket at `ws(s)://…/ws` (design §13.1).
   */
  GATEWAY_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:8080'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Seeds the bots' seeds, to replay a run. Random if unset. */
  BOT_SEED: z.coerce.number().int().min(0).optional(),
});

export type Config = z.infer<typeof schema>;

/** Reads and validates the environment. Exits with a readable error if it's invalid. */
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const result = schema.safeParse(env);
  if (!result.success) {
    console.error(`Invalid environment:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  return result.data;
};
