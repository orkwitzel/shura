import type { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { Logger } from 'nestjs-pino';

/**
 * Sets up a created app the way it runs: the pino logger, the WS adapter and shutdown hooks.
 * `main.ts` and the tests' `boot()` both call it, so tests run the app as it ships.
 */
export const configureApp = (app: INestApplication): void => {
  app.useLogger(app.get(Logger));
  // One message at a time per socket, in order (ADR 0014).
  app.useWebSocketAdapter(new WsAdapter(app, { maxConcurrentMessages: 1 }));
  app.enableShutdownHooks();
};
