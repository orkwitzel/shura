import { hostname } from 'node:os';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  VALKEY_URL: z.url().default('redis://localhost:6379'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** The pod's name in its logs (design §12). */
  POD_ID: z.string().min(1).default(hostname()),
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
