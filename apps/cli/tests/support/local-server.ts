import type { AddressInfo } from 'node:net';
import { createGameService } from '@shura/game';
import {
  createGateway,
  createHttpServer,
  type Peer,
  type PeerListeners,
  systemClock,
} from '@shura/gateway';
import { createMemoryStores } from '@shura/valkey';
import { pino } from 'pino';

/** A real gateway on a local port, with one game pod and in-memory Valkey, in this process. */
export interface LocalServer {
  /** The gateway's WebSocket URL, for `--server`. */
  readonly url: string;
  close(): Promise<void>;
}

/** Two ends of an in-memory link, each message delivered a microtask after it's sent. */
function peerPair(): [Peer, Peer] {
  const ends = [0, 1].map(() => ({
    listeners: null as PeerListeners | null,
    waiting: [] as string[],
    closed: false,
  }));
  const peer = (self: number): Peer => ({
    send(text) {
      queueMicrotask(() => {
        const other = ends[1 - self];
        if (!other || other.closed) return;
        if (other.listeners) other.listeners.message(text);
        else other.waiting.push(text);
      });
    },
    close() {
      queueMicrotask(() => {
        for (const end of ends) {
          if (end.closed) continue;
          end.closed = true;
          end.listeners?.close();
        }
      });
    },
    listen(listeners) {
      const end = ends[self];
      if (!end) return;
      end.listeners = listeners;
      for (const text of end.waiting.splice(0)) listeners.message(text);
    },
  });
  return [peer(0), peer(1)];
}

/**
 * Starts the server (design §14) on the system clock: the gateway listens on 127.0.0.1 at a free
 * port, as `pnpm dev`'s does at 8080, and links to its game pod in memory.
 */
export async function startLocalServer(): Promise<LocalServer> {
  const stores = createMemoryStores();
  const logger = pino({ level: 'silent' });
  const game = createGameService({
    clock: systemClock,
    stores,
    podId: 'game-1',
    address: 'game-1:8081',
    logger,
  });
  await game.start();
  const gateway = createGateway({
    clock: systemClock,
    stores,
    dial: () => {
      const [gatewayEnd, gameEnd] = peerPair();
      game.accept(gameEnd);
      return gatewayEnd;
    },
    logger,
  });
  const http = createHttpServer(gateway);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}`,
    async close() {
      http.closeAllConnections();
      await new Promise((resolve) => http.close(resolve));
      await game.stop();
      await stores.close();
    },
  };
}
