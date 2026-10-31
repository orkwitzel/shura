import {
  type Connect,
  createOnlineSession,
  type Handling,
  type OnlineSession,
  type OnlineSocket,
  webSocketConnect,
} from '@shura/client-core';
import { CLIENT_VERSION, GATEWAY_PATH } from '@/config/online';
import { createOnlineClock } from './online-clock';

/** What the app chooses for each online session; the browser gives it the rest. */
export interface OpenOnlineSessionOptions {
  readonly nickname: string;
  /** The token of this tab's earlier session, to come back as it (design §10.2). */
  readonly sessionToken?: string | undefined;
  readonly handling?: Partial<Handling>;
}

/** Opens an online session; the app's is `openOnlineSession`, and tests pass a fake. */
export type OpenOnlineSession = (options: OpenOnlineSessionOptions) => OnlineSession;

/**
 * The gateway's WebSocket URL for a page at `location`: `/ws` on the page's own origin, which Vite
 * forwards to the gateway in dev and the ingress in production (design §13.2), so the browser sees
 * one origin.
 */
export function gatewayUrl({ protocol, host }: Pick<Location, 'protocol' | 'host'>): string {
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}${GATEWAY_PATH}`;
}

/**
 * `connect`, dialling only after the current task: a session closed straight away, as React's
 * Strict Mode does with the one its rehearsal mount makes, never opens a socket, so the browser
 * doesn't warn of one closed before it connected.
 */
export function deferredConnect(connect: Connect): Connect {
  return (url, handlers) => {
    let socket: OnlineSocket | null = null;
    let closed = false;
    queueMicrotask(() => {
      if (!closed) socket = connect(url, handlers);
    });
    return {
      // Nothing is sent before the socket opens: the session's first message waits for `open`.
      send: (text) => socket?.send(text),
      close: () => {
        closed = true;
        socket?.close();
      },
    };
  };
}

/**
 * An online session over the browser's own `WebSocket`, to this page's gateway, on the online
 * clock. It connects at once.
 */
export const openOnlineSession: OpenOnlineSession = ({ nickname, sessionToken, handling }) =>
  createOnlineSession({
    url: gatewayUrl(window.location),
    connect: deferredConnect(webSocketConnect((url) => new WebSocket(url))),
    clock: createOnlineClock(),
    nickname,
    clientVersion: CLIENT_VERSION,
    ...(sessionToken !== undefined && { sessionToken }),
    ...(handling && { handling }),
  });
