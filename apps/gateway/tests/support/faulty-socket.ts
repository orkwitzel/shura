import type { Connect } from '@shura/client-core';
import type { ServerMessage } from '@shura/protocol';

/**
 * Which way a client's messages go: `inbound` from the server to the client. (#64 adds
 * `outbound` and `drop()`, for reconnects and lag-outs.)
 */
export type Direction = 'inbound';

/**
 * A client's socket on a faulty network (design §14): a test holds back its messages, as a slow
 * network would, and releases them, in order. Pass `through` to `OnlineWorld.client`.
 */
export interface FaultySocket {
  /** Wraps a client's `Connect`, for `OnlineWorld.client`'s `through`. */
  readonly through: (connect: Connect) => Connect;
  /**
   * Holds back the first message going `direction` that `from` matches (any message, without it)
   * and every message after it, until `release`.
   */
  hold(direction: Direction, from?: (message: ServerMessage) => boolean): void;
  /** Delivers the messages held going `direction`, in order, and stops holding them. */
  release(direction: Direction): void;
  /** The messages held going `direction` and not yet delivered, in order. */
  held(direction: Direction): readonly ServerMessage[];
}

export function faultySocket(): FaultySocket {
  let from: ((message: ServerMessage) => boolean) | null = null;
  let held: ServerMessage[] | null = null;
  let deliver: (text: string) => void = () => {};
  return {
    through: (connect) => (url, handlers) => {
      deliver = handlers.message;
      return connect(url, {
        ...handlers,
        message: (text) => {
          const message = JSON.parse(text) as ServerMessage;
          if (!held && from?.(message)) held = [];
          if (held) held.push(message);
          else handlers.message(text);
        },
      });
    },
    hold(_direction, starts = () => true) {
      from = starts;
    },
    release() {
      const due = held ?? [];
      held = null;
      from = null;
      for (const message of due) deliver(JSON.stringify(message));
    },
    held: () => held ?? [],
  };
}
