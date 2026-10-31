import type { Connect } from '@shura/client-core';
import type { ServerMessage } from '@shura/protocol';

/** A client's incoming messages, which a test can hold back, as a slow network would. */
export interface HeldInbound {
  /** Wraps a client's `Connect`, for `OnlineWorld.client`. */
  readonly through: (connect: Connect) => Connect;
  /** Holds back the first message `starts` matches, and every message after it, until `release`. */
  holdFrom(starts: (message: ServerMessage) => boolean): void;
  /** Delivers the messages held, in order, and stops holding. */
  release(): void;
  /** The messages held back and not yet delivered, in order. */
  readonly held: readonly ServerMessage[];
}

export function heldInbound(): HeldInbound {
  let starts: ((message: ServerMessage) => boolean) | null = null;
  let held: ServerMessage[] | null = null;
  let deliver: (text: string) => void = () => {};
  return {
    through: (connect) => (url, handlers) => {
      deliver = handlers.message;
      return connect(url, {
        ...handlers,
        message: (text) => {
          const message = JSON.parse(text) as ServerMessage;
          if (!held && starts?.(message)) held = [];
          if (held) held.push(message);
          else handlers.message(text);
        },
      });
    },
    holdFrom(predicate) {
      starts = predicate;
    },
    release() {
      const due = held ?? [];
      held = null;
      starts = null;
      for (const message of due) deliver(JSON.stringify(message));
    },
    get held() {
      return held ?? [];
    },
  };
}
