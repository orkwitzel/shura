import { type Logger, pino } from 'pino';

export type { Logger };

/** The bot tool's pino logger (design §12): JSON to stdout, pretty-printed by `pino-pretty`. */
export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: 'bot' },
    ...(process.env.NODE_ENV !== 'production' && { transport: { target: 'pino-pretty' } }),
  });
}
