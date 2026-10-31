import { createServer, type Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { addressList, clientIp } from './client-ip';
import type { Gateway } from './gateway';
import { DEFAULT_LIMITS, type GatewayLimits } from './limits';
import { wsPeer } from './peer';

/**
 * The gateway's HTTP server: `/livez` and `/readyz` (their real checks, and the move to an
 * internal port, come in M5), and with a gateway, players' WebSockets on any path (the ingress
 * routes `/ws` here, design §9.1), at most `maxPayloadBytes` a message (a bigger one closes the
 * connection with 1009) and without compression (§8.2). A player's address is the socket's, or
 * behind one of `trustedProxies`, from `X-Forwarded-For` (§11).
 */
export function createHttpServer(
  gateway?: Gateway,
  limits: Pick<GatewayLimits, 'maxPayloadBytes' | 'trustedProxies'> = DEFAULT_LIMITS,
): Server {
  const server = createServer((req, res) => {
    if (req.url === '/livez' || req.url === '/readyz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n');
      return;
    }
    res.writeHead(404).end();
  });
  if (gateway) {
    const proxies = addressList(limits.trustedProxies);
    const sockets = new WebSocketServer({
      server,
      maxPayload: limits.maxPayloadBytes,
      perMessageDeflate: false,
    });
    sockets.on('connection', (socket, request) =>
      gateway.accept(
        wsPeer(socket),
        clientIp(request.socket.remoteAddress ?? '', request.headers['x-forwarded-for'], proxies),
      ),
    );
  }
  return server;
}
