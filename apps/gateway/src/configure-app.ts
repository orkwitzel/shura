import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { type GatewayLimits, LIMITS } from './config';
import { ClientWsAdapter } from './limits';

/**
 * Sets up a created app the way it runs: the pino logger, the WS adapter and shutdown hooks.
 * `main.ts` and the tests' `boot()` both call it, so tests run the app as it ships.
 */
export const configureApp = (app: INestApplication): void => {
  app.useLogger(app.get(Logger));
  // One message at a time per socket, in order (ADR 0014), under the socket's limits (design §11).
  app.useWebSocketAdapter(
    new ClientWsAdapter(app, app.get<GatewayLimits>(LIMITS), { maxConcurrentMessages: 1 }),
  );
  app.enableShutdownHooks();
};
