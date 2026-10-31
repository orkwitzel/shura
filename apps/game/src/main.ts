import { createValkeyStores } from '@shura/valkey';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { createGameService } from './game-service';
import { createLogger } from './logger';
import { createHttpServer } from './server';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.POD_ID);
const stores = createValkeyStores(config.VALKEY_URL);
const service = createGameService({
  clock: systemClock,
  stores,
  podId: config.POD_ID,
  address: config.POD_ADDRESS,
  logger,
});
const server = createHttpServer(service);

await service.start();
server.listen(config.PORT, () => {
  logger.info({ port: config.PORT, address: config.POD_ADDRESS }, 'game listening');
});

process.on('SIGTERM', () => {
  server.close();
  service
    .stop()
    .then(() => stores.close())
    .catch((error: unknown) => logger.error({ err: error }, 'shutdown failed'));
});
