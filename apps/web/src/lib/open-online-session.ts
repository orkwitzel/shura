import {
  type Connect,
  createOnlineSession,
  type Fetch,
  type Handling,
  type OnlineSession,
  type OnlineSocket,
  webSocketConnect,
} from '@shura/client-core';
import { CLIENT_VERSION } from '@/config/online';
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
 * `fetch`, called only after the current task, and not at all once `closed()` says the session
 * was closed by then: Strict Mode's rehearsal session makes no `POST /api/sessions`, so it leaves
 * no session behind on the server and nothing counts against the session limit (design §11).
 */
export function deferredFetch(fetch: Fetch, closed: () => boolean): Fetch {
  return async (url, init) => {
    await Promise.resolve();
    if (closed()) throw new Error('the session was closed before it asked');
    return fetch(url, init);
  };
}

/** The browser's own `fetch`. */
const browserFetch: Fetch = (url, init) => fetch(url, init);

/**
 * An online session to this page's own origin, whose `/api` and `/ws` Vite forwards to the
 * gateway in dev and the ingress in production (design §13.2), so the browser sees one origin: the
 * session over the browser's `fetch` and `WebSocket`, on the online clock. It connects at once.
 */
export const openOnlineSession: OpenOnlineSession = ({ nickname, sessionToken, handling }) => {
  let session: OnlineSession | null = null;
  const closed = () => session?.getState().connection.status === 'closed';
  session = createOnlineSession({
    serverUrl: window.location.origin,
    connect: deferredConnect(webSocketConnect((url) => new WebSocket(url))),
    fetch: deferredFetch(browserFetch, closed),
    clock: createOnlineClock(),
    nickname,
    clientVersion: CLIENT_VERSION,
    ...(sessionToken !== undefined && { sessionToken }),
    ...(handling && { handling }),
  });
  return session;
};
