/** What an online session hears from its socket. */
export interface SocketHandlers {
  open(): void;
  /** A text message: a JSON server message, before it's checked. */
  message(text: string): void;
  /** The socket closed, or never opened. */
  close(): void;
}

/** The session's end of the WebSocket (design §8.2). */
export interface OnlineSocket {
  send(text: string): void;
  close(): void;
}

/**
 * Opens a WebSocket to `url`. Each app passes its platform's (the browser's and Node's own
 * `WebSocket`, through `webSocketConnect`); tests connect to an in-process gateway.
 */
export type Connect = (url: string, handlers: SocketHandlers) => OnlineSocket;

/** The standard `WebSocket` API, as much of it as `webSocketConnect` uses. */
export interface StandardWebSocket {
  send(data: string): void;
  close(): void;
  onopen: unknown;
  onmessage: unknown;
  onclose: unknown;
}

/**
 * `Connect` over the standard `WebSocket` class that browsers and Node both have:
 * `webSocketConnect((url) => new WebSocket(url))`.
 */
export function webSocketConnect(open: (url: string) => StandardWebSocket): Connect {
  return (url, handlers) => {
    const socket = open(url);
    socket.onopen = () => handlers.open();
    socket.onmessage = (event: { data: unknown }) => handlers.message(String(event.data));
    socket.onclose = () => handlers.close();
    return socket;
  };
}
