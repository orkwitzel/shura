import type { Connect, Fetch } from '@shura/client-core';
import type { ClientMessage, ServerMessage } from '@shura/protocol';

/** A gateway's `/api` and `/ws` in memory, for the CLI's online screens. */
export interface FakeServer {
  readonly connect: Connect;
  readonly fetch: Fetch;
  /** Every message the client sent on the socket, in order. */
  readonly received: ClientMessage[];
  /** The bodies of the client's `POST /api/sessions`, in order. */
  readonly sessions: unknown[];
  /** Sends the client a message, as the server would at any time. */
  push(message: ServerMessage): void;
}

export interface FakeServerOptions {
  /** Answers each socket message; `undefined` leaves it to the defaults (welcome, pong). */
  readonly reply?: (message: ClientMessage) => ServerMessage[] | undefined;
  /** Answers `POST /api/sessions` with this status and body instead of a new session. */
  readonly session?: { readonly status: number; readonly body: unknown };
}

/** A server that creates every session, welcomes every `hello` and answers pings. */
export function fakeServer({
  reply = () => undefined,
  session,
}: FakeServerOptions = {}): FakeServer {
  const received: ClientMessage[] = [];
  const sessions: unknown[] = [];
  let toClient: ((text: string) => void) | null = null;
  let closeClient: (() => void) | null = null;
  const push = (message: ServerMessage) => setTimeout(() => toClient?.(JSON.stringify(message)), 0);
  const answer = (message: ClientMessage): ServerMessage[] => {
    const scripted = reply(message);
    if (scripted) return scripted;
    if (message.event === 'hello')
      return [{ event: 'welcome', data: { sessionId: 'me', serverTime: 0 } }];
    if (message.event === 'ping') {
      return [{ event: 'pong', data: { id: message.data.id, serverTime: 0 } }];
    }
    return [];
  };
  return {
    received,
    sessions,
    push,
    fetch: async (_url, init) => {
      sessions.push(init.body === undefined ? undefined : JSON.parse(init.body));
      const { status, body } = session ?? {
        status: 201,
        body: { sessionId: 'me', sessionToken: 't', nickname: 'Ada' },
      };
      return { ok: status < 400, status, json: async () => body };
    },
    connect: (_url, handlers) => {
      toClient = handlers.message;
      closeClient = handlers.close;
      setTimeout(handlers.open, 0);
      return {
        send(text) {
          const message = JSON.parse(text) as ClientMessage;
          received.push(message);
          const answers = answer(message);
          for (const answered of answers) push(answered);
          if (answers.some(({ event }) => event === 'exception') && message.event === 'hello') {
            setTimeout(() => closeClient?.(), 0);
          }
        },
        close: () => setTimeout(() => closeClient?.(), 0),
      };
    },
  };
}
