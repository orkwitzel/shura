// Testing tool only (design §13.4): never deployed, and not part of the product.
import { webSocketConnect } from '@shura/client-core';
import closeWithGrace from 'close-with-grace';
import { botClock } from './platform/clock';
import { loadConfig } from './platform/config';
import { createLogger } from './platform/logger';
import { createBotPool } from './service/bot-pool';
import { createBotServer } from './service/server';

const config = loadConfig();
const logger = createLogger(config);
const pool = createBotPool({
  serverUrl: config.GATEWAY_URL,
  // Node's own WebSocket and fetch, as the CLI's.
  connect: webSocketConnect((url) => new WebSocket(url)),
  fetch,
  clock: botClock,
  logger,
  seed: config.BOT_SEED ?? Math.floor(Math.random() * 2 ** 32),
  clientVersion: 'bot',
});
const server = createBotServer(pool);

server.listen(config.BOT_PORT, () => {
  logger.info({ port: config.BOT_PORT, gateway: config.GATEWAY_URL }, 'bot tool listening');
});

/** How long a shutdown may take before the process exits anyway, in ms. */
const SHUTDOWN_MS = 5000;

// On SIGTERM or SIGINT, or a fatal error, the bots leave their rooms and the server stops, then the
// process exits; past SHUTDOWN_MS it exits anyway. Idle keep-alive connections are closed, since
// `server.close()` would wait for them.
closeWithGrace({ delay: SHUTDOWN_MS, logger }, async ({ err, signal }) => {
  if (err) logger.error({ err }, 'bot tool failed');
  else logger.info({ signal }, 'bot tool stopping');
  pool.close();
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  server.closeIdleConnections();
  await closed;
});
