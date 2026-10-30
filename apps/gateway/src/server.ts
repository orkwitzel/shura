import { createServer, type Server } from 'node:http';

// Only health endpoints for now. Their real checks (Valkey, draining) arrive with M4/M5.
export const createHttpServer = (): Server =>
  createServer((req, res) => {
    if (req.url === '/livez' || req.url === '/readyz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n');
      return;
    }
    res.writeHead(404).end();
  });
