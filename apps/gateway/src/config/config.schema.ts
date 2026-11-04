import { hostname } from 'node:os';
import { z } from 'zod';

/** The gateway's environment, validated at startup (docs/design.md §14). */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** The pod's name in its logs (design §12). */
  POD_ID: z.string().min(1).default(hostname()),
});

export type Env = z.infer<typeof envSchema>;

/** `@nestjs/config`'s `validate`: the parsed environment, or a readable error that stops startup. */
export const validateEnv = (env: Record<string, unknown>): Env => {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
};
