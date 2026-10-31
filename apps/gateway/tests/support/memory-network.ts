import type { Connect } from '@shura/client-core';
import type { GameService } from '@shura/game';
import type { Gateway } from '../../src/gateway';
import type { DialGame, Peer, PeerListeners } from '../../src/peer';

/**
 * Two connected ends of an in-memory connection. Each message is delivered a microtask after it's
 * sent, in order, as text, so it goes through the same JSON and schema checks as over a socket.
 * Closing either end closes both, after the messages already sent.
 */
export function peerPair(): [Peer, Peer] {
  const ends = [0, 1].map(() => ({
    listeners: null as PeerListeners | null,
    waiting: [] as string[],
    closed: false,
  }));
  const deliver = (to: number, text: string) => {
    const end = ends[to];
    if (!end || end.closed) return;
    if (end.listeners) end.listeners.message(text);
    else end.waiting.push(text);
  };
  const closeBoth = () => {
    for (const end of ends) {
      if (end.closed) continue;
      end.closed = true;
      end.listeners?.close();
    }
  };
  const peer = (self: number): Peer => ({
    send(text) {
      if (ends[self]?.closed) return;
      queueMicrotask(() => deliver(1 - self, text));
    },
    close() {
      queueMicrotask(closeBoth);
    },
    listen(listeners) {
      const end = ends[self];
      if (!end) return;
      end.listeners = listeners;
      const waiting = end.waiting;
      end.waiting = [];
      for (const text of waiting) listeners.message(text);
    },
  });
  return [peer(0), peer(1)];
}

/** Game pods by address, dialled in memory. */
export function memoryDial(pods: Readonly<Record<string, GameService>>): DialGame {
  return (address) => {
    const pod = pods[address];
    if (!pod) throw new Error(`no game pod at ${address}`);
    const [gatewayEnd, gameEnd] = peerPair();
    pod.accept(gameEnd);
    return gatewayEnd;
  };
}

/** Clients' WebSockets to `gateway`, in memory, from 127.0.0.1. */
export function memoryConnect(gateway: Gateway): Connect {
  return (_url, handlers) => {
    const [clientEnd, gatewayEnd] = peerPair();
    gateway.accept(gatewayEnd, '127.0.0.1');
    clientEnd.listen({ message: handlers.message, close: handlers.close });
    queueMicrotask(handlers.open);
    return clientEnd;
  };
}
