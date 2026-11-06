import {
  type Connect,
  createOnlineSession,
  type Fetch,
  type OnlineSession,
  type SocketHandlers,
} from '@shura/client-core';
import type { ClientMessage, ServerMessage } from '@shura/protocol';
import { act } from '@testing-library/react';
import { createOnlineClock } from '@/lib/online/online-clock';
import type { OpenOnlineSession } from '@/lib/online/open-online-session';
import { fakeBrowser } from './fake-browser';

/**
 * The gateway, played by the test, for real client-core online sessions on the online clock over
 * a fake browser (`fakeBrowser`): `POST /api/sessions` makes the session `me` named `Or`, what the
 * sessions send on the socket is kept in `sent`, and `say` answers.
 */
export interface ScriptedServer {
  /** Opens real online sessions on this server and the fake browser's clock. */
  readonly open: OpenOnlineSession;
  readonly browser: ReturnType<typeof fakeBrowser>;
  /** The latest session opened. */
  readonly session: () => OnlineSession;
  /** Everything the sessions sent on the socket, oldest first. */
  readonly sent: ClientMessage[];
  /**
   * Lets the session's `POST /api/sessions` answer, opens the socket it then dials and welcomes
   * its `hello`, inside `act`.
   */
  accept(): Promise<void>;
  /** Sends `message` to the session, inside `act`. */
  say(message: ServerMessage): void;
  /** Drops the connection, as a network does, inside `act`. */
  drop(): void;
  /** Moves the browser's time on by `ms`, in steps of about a frame, inside `act`. */
  run(ms: number): void;
}

/** What the server's `POST /api/sessions` answers: the session `me`, named `Or`. */
const SESSION = { sessionId: 'me', sessionToken: 't', nickname: 'Or' } as const;

export function scriptedServer(): ScriptedServer {
  const browser = fakeBrowser();
  const sent: ClientMessage[] = [];
  const sessions: OnlineSession[] = [];
  let socket: SocketHandlers | null = null;
  const connect: Connect = (_url, handlers) => {
    socket = handlers;
    return {
      send: (text) => sent.push(JSON.parse(text)),
      close: () => {},
    };
  };
  const fetch: Fetch = async () => ({ ok: true, status: 201, json: async () => SESSION });
  const say = (message: ServerMessage) => act(() => socket?.message(JSON.stringify(message)));
  return {
    open: ({ nickname, handling }) => {
      const session = createOnlineSession({
        serverUrl: 'http://shura.test',
        connect,
        fetch,
        clock: createOnlineClock(browser.platform),
        nickname,
        clientVersion: 'test',
        ...(handling && { handling }),
      });
      sessions.push(session);
      return session;
    },
    browser,
    session: () => {
      const session = sessions.at(-1);
      if (!session) throw new Error('no online session was opened');
      return session;
    },
    sent,
    async accept() {
      // The session's `POST` answers after a few microtasks, then it dials.
      await act(async () => {});
      act(() => socket?.open());
      say({ event: 'welcome', data: { sessionId: SESSION.sessionId, serverTime: 0 } });
    },
    say,
    drop: () => act(() => socket?.close()),
    run(ms) {
      act(() => {
        for (let left = ms; left > 0; left -= 16) browser.advance(Math.min(16, left));
      });
    },
  };
}
