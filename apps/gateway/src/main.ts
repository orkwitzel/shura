import { loadConfig } from './config';
import { createHttpServer } from './server';

const config = loadConfig();
const server = createHttpServer();

server.listen(config.PORT, () => {
  console.log(`gateway listening on :${config.PORT}`);
});

process.on('SIGTERM', () => {
  server.close();
});
