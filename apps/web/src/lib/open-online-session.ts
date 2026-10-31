import {
  createOnlineSession,
  type Handling,
  type OnlineSession,
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
 * An online session over the browser's own `WebSocket`, to this page's gateway, on the online
 * clock. It connects at once.
 */
export const openOnlineSession: OpenOnlineSession = ({ nickname, sessionToken, handling }) =>
  createOnlineSession({
    url: gatewayUrl(window.location),
    connect: webSocketConnect((url) => new WebSocket(url)),
    clock: createOnlineClock(),
    nickname,
    clientVersion: CLIENT_VERSION,
    ...(sessionToken !== undefined && { sessionToken }),
    ...(handling && { handling }),
  });
