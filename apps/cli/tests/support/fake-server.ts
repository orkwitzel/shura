import type { Connect } from '@shura/client-core';
import type { ClientMessage, ServerMessage } from '@shura/protocol';

/** A gateway that answers each client message with the messages `reply` gives for it. */
export interface FakeServer {
  readonly connect: Connect;
  /** Every message the client sent, in order. */
  readonly received: ClientMessage[];
  /** Sends the client a message, as the server would at any time. */
  push(message: ServerMessage): void;
}

/** A server that welcomes every `hello` and answers pings, unless `reply` answers first. */
export function fakeServer(
  reply: (message: ClientMessage) => ServerMessage[] | undefined = () => undefined,
): FakeServer {
  const received: ClientMessage[] = [];
  let toClient: ((text: string) => void) | null = null;
  let closeClient: (() => void) | null = null;
  const push = (message: ServerMessage) => setTimeout(() => toClient?.(JSON.stringify(message)), 0);
  const answer = (message: ClientMessage): ServerMessage[] => {
    const scripted = reply(message);
    if (scripted) return scripted;
    if (message.type === 'hello') {
      const { nickname } = message;
      return [{ type: 'welcome', sessionId: 'me', sessionToken: 't', nickname, serverTime: 0 }];
    }
    if (message.type === 'ping') return [{ type: 'pong', id: message.id, serverTime: 0 }];
    return [];
  };
  return {
    received,
    push,
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
          if (answers.some(({ type }) => type === 'error') && message.type === 'hello') {
            setTimeout(() => closeClient?.(), 0);
          }
        },
        close: () => setTimeout(() => closeClient?.(), 0),
      };
    },
  };
}
