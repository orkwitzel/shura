// Testing tool only (design §13.4): never deployed, and not part of the product.
import { webSocketConnect } from '@shura/client-core';
import { createBotPool } from './bot-pool';
import { botClock } from './clock';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { createBotServer } from './server';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const pool = createBotPool({
  url: config.GATEWAY_URL,
  connect: webSocketConnect((url) => new WebSocket(url)),
  clock: botClock,
  logger,
  seed: config.BOT_SEED ?? Math.floor(Math.random() * 2 ** 32),
  clientVersion: 'bot',
});
const server = createBotServer(pool);

server.listen(config.BOT_PORT, () => {
  logger.info({ port: config.BOT_PORT, gateway: config.GATEWAY_URL }, 'bot tool listening');
});

const shutDown = () => {
  pool.close();
  server.close();
};
process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);
