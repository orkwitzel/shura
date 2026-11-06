import { type Logger, pino } from 'pino';
import type { Config } from './config';

export type { Logger };

/**
 * The bot tool's pino logger (design §12): JSON to stdout, pretty-printed by `pino-pretty` only in
 * development (`NODE_ENV=development`, which the `serve` script sets).
 */
export function createLogger({ LOG_LEVEL, NODE_ENV }: Config): Logger {
  return pino({
    level: LOG_LEVEL,
    base: { service: 'bot' },
    ...(NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
  });
}
