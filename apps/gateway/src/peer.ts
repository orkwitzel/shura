import { WebSocket } from 'ws';

/** What a peer's connection tells its owner. */
export interface PeerListeners {
  message(text: string): void;
  close(): void;
}

/**
 * One end of a connection that carries JSON text messages: a player's WebSocket, or the internal
 * link to a game pod (design §9.1). `ws` in production; tests connect clients, gateway and game in
 * memory.
 */
export interface Peer {
  /** Sends a message. A link still opening keeps it until it's open. */
  send(text: string): void;
  close(): void;
  /** Sets who hears the connection's messages and its close. */
  listen(listeners: PeerListeners): void;
}

/** Opens the internal link to the game pod at `address` (`host:port`). */
export type DialGame = (address: string) => Peer;

/** A `ws` socket as a `Peer`. Messages sent before it opens wait for it. */
export function wsPeer(socket: WebSocket): Peer {
  let waiting: string[] = [];
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.once('open', () => {
      for (const text of waiting) socket.send(text);
      waiting = [];
    });
  }
  return {
    send(text) {
      if (socket.readyState === WebSocket.CONNECTING) waiting.push(text);
      else if (socket.readyState === WebSocket.OPEN) socket.send(text);
    },
    close: () => socket.close(),
    listen({ message, close }) {
      socket.on('message', (data) => message(data.toString()));
      socket.on('close', close);
      // An error closes the socket too, and `close` follows it.
      socket.on('error', () => {});
    },
  };
}

/** Dials game pods over `ws` (ADR 0005). */
export const dialGame: DialGame = (address) =>
  wsPeer(new WebSocket(`ws://${address}`, { perMessageDeflate: false }));
