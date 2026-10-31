import { hostname } from 'node:os';
import { type Logger, pino } from 'pino';

export type { Logger };

/**
 * The service's pino logger (design §12): JSON to stdout with `service` and `pod`, pretty-printed
 * by `pino-pretty` outside production. Inputs and nicknames are never logged at info level.
 */
export function createLogger(level: string, pod: string = hostname()): Logger {
  const pretty = process.env.NODE_ENV !== 'production';
  return pino({
    level,
    base: { service: 'gateway', pod },
    ...(pretty && { transport: { target: 'pino-pretty' } }),
  });
}
