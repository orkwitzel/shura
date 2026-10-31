import type { WebSocket } from 'ws';

/** What a peer's connection tells its owner. */
export interface PeerListeners {
  message(text: string): void;
  close(): void;
}

/**
 * One end of a connection that carries JSON text messages: a gateway's internal link to this pod
 * (design §9.1). `ws` in production; tests connect gateway and game in memory.
 */
export interface Peer {
  send(text: string): void;
  close(): void;
  /** Sets who hears the connection's messages and its close. */
  listen(listeners: PeerListeners): void;
}

/** A `ws` socket as a `Peer`. */
export function wsPeer(socket: WebSocket): Peer {
  return {
    send: (text) => socket.send(text),
    close: () => socket.close(),
    listen({ message, close }) {
      socket.on('message', (data) => message(data.toString()));
      socket.on('close', close);
      // An error closes the socket too, and `close` follows it.
      socket.on('error', () => {});
    },
  };
}
