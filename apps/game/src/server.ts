import { createServer, type Server } from 'node:http';
import { LIMIT_DEFAULTS } from '@shura/protocol';
import { WebSocketServer } from 'ws';
import type { GameService } from './game-service';
import { wsPeer } from './peer';

/**
 * The pod's HTTP server: `/livez` and `/readyz` (their real checks, Valkey and draining, come in
 * M5), and with a service, the internal WebSocket gateways link to (design §9.1). Nothing on it is
 * public: only gateways reach a game pod.
 */
export function createHttpServer(service?: GameService): Server {
  const server = createServer((req, res) => {
    if (req.url === '/livez' || req.url === '/readyz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n');
      return;
    }
    res.writeHead(404).end();
  });
  if (service) {
    // A link carries every room's traffic for the gateway, so it may be busier than a client's
    // connection, but each message is still one client message or one server message.
    const links = new WebSocketServer({
      server,
      maxPayload: 4 * LIMIT_DEFAULTS.maxPayloadBytes,
      perMessageDeflate: false,
    });
    links.on('connection', (socket) => service.accept(wsPeer(socket)));
  }
  return server;
}
