import {
  type Connect,
  createOnlineSession,
  type OnlineSession,
  type SocketHandlers,
} from '@shura/client-core';
import { act } from '@testing-library/react';
import { createOnlineClock } from '@/lib/online-clock';
import type { OpenOnlineSession } from '@/lib/open-online-session';
import { fakeBrowser } from './fake-browser';

/** A message a client sent, parsed. */
export type Sent = { readonly type: string } & Record<string, unknown>;

/**
 * The gateway, played by the test, for a real client-core online session on the online clock over
 * a fake browser (`fakeBrowser`): what the session sends is kept in `sent`, and `say` answers.
 */
export interface ScriptedServer {
  /** Opens real online sessions on this server and the fake browser's clock. */
  readonly open: OpenOnlineSession;
  readonly browser: ReturnType<typeof fakeBrowser>;
  /** The latest session opened. */
  readonly session: () => OnlineSession;
  /** Everything the sessions sent, oldest first. */
  readonly sent: Sent[];
  /** Opens the socket the session dialled and welcomes it as `me`, inside `act`. */
  accept(): void;
  /** Sends `message` to the session, inside `act`. */
  say(message: object): void;
  /** Drops the connection, as a network does, inside `act`. */
  drop(): void;
  /** Moves the browser's time on by `ms`, in steps of about a frame, inside `act`. */
  run(ms: number): void;
}

export function scriptedServer(): ScriptedServer {
  const browser = fakeBrowser();
  const sent: Sent[] = [];
  const sessions: OnlineSession[] = [];
  let socket: SocketHandlers | null = null;
  const connect: Connect = (_url, handlers) => {
    socket = handlers;
    return {
      send: (text) => sent.push(JSON.parse(text)),
      close: () => {},
    };
  };
  const say = (message: object) => act(() => socket?.message(JSON.stringify(message)));
  return {
    open: ({ nickname, handling }) => {
      const session = createOnlineSession({
        url: 'ws://test/ws',
        connect,
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
    accept() {
      act(() => socket?.open());
      say({ type: 'welcome', sessionId: 'me', sessionToken: 't', nickname: 'Or', serverTime: 0 });
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
