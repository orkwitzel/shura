import { hostname } from 'node:os';
import { z } from 'zod';

const schema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(8081),
    VALKEY_URL: z.url().default('redis://localhost:6379'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** The pod's id in its heartbeat (design §9.5). */
    POD_ID: z.string().min(1).default(hostname()),
    /** The pod's own IP, which gateways reach it at (design §9.2). */
    POD_IP: z.string().min(1).default('localhost'),
  })
  .transform((env) => ({ ...env, POD_ADDRESS: `${env.POD_IP}:${env.PORT}` }));

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
