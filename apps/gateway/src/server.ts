import { createServer, type Server } from 'node:http';
import { LIMIT_DEFAULTS } from '@shura/protocol';
import { WebSocketServer } from 'ws';
import type { Gateway } from './gateway';
import { wsPeer } from './peer';

/**
 * The gateway's HTTP server: `/livez` and `/readyz` (their real checks, and the move to an
 * internal port, come in M5), and with a gateway, players' WebSockets on any path (the ingress
 * routes `/ws` here, design §9.1), at most 16 KB a message and without compression (§8.2).
 */
export function createHttpServer(gateway?: Gateway): Server {
  const server = createServer((req, res) => {
    if (req.url === '/livez' || req.url === '/readyz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n');
      return;
    }
    res.writeHead(404).end();
  });
  if (gateway) {
    const sockets = new WebSocketServer({
      server,
      maxPayload: LIMIT_DEFAULTS.maxPayloadBytes,
      perMessageDeflate: false,
    });
    // #66 takes the address from `X-Forwarded-For` behind `TRUSTED_PROXIES`.
    sockets.on('connection', (socket, request) =>
      gateway.accept(wsPeer(socket), request.socket.remoteAddress ?? ''),
    );
  }
  return server;
}
