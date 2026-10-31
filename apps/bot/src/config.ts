import { z } from 'zod';

const schema = z.object({
  /** The bot tool's HTTP API (design §13.4). */
  BOT_PORT: z.coerce.number().int().min(1).max(65535).default(8090),
  /** The gateway's public WebSocket, which bots connect to like any client. */
  GATEWAY_URL: z.url({ protocol: /^wss?$/ }).default('ws://localhost:8080'),
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
