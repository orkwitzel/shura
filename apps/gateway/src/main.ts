import { createValkeyStores } from '@shura/valkey';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { createGateway } from './gateway';
import { createLogger } from './logger';
import { dialGame } from './peer';
import { createHttpServer } from './server';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.POD_ID);
const stores = createValkeyStores(config.VALKEY_URL, { prefix: config.VALKEY_PREFIX });
const gateway = createGateway({ clock: systemClock, stores, dial: dialGame, logger });
const server = createHttpServer(gateway);

server.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'gateway listening');
});

process.on('SIGTERM', () => {
  server.close();
  stores.close().catch((error: unknown) => logger.error({ err: error }, 'shutdown failed'));
});
