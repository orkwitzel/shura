import type { Connect, Fetch, SocketHandlers } from '@shura/client-core';

/** Which way messages go: from the server to the client, or from the client to the server. */
export type Direction = 'inbound' | 'outbound';

/** A message on the line, as JSON: `{ event, data }`. */
export interface LineMessage {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

/**
 * A test client's line to the gateway, with faults a real network has (design §14): messages held
 * back and let through later in order, and drops. It wraps the client's real socket (`through`)
 * and its `fetch` (`fetchThrough`), so pass it whole as the client's options:
 * `world.client('Ada', line)`. Nothing in the services knows about it.
 */
export interface FaultySocket {
  /** Wraps the client's socket connections, for `OnlineWorld.client`. */
  readonly through: (connect: Connect) => Connect;
  /** Wraps the client's `fetch`, for `OnlineWorld.client`: requests fail while the line is down. */
  readonly fetchThrough: (fetch: Fetch) => Fetch;
  /**
   * Holds back the messages going `direction`, as a slow network would: every one from now on, or
   * from the first one `from` matches. They wait until `release`.
   */
  hold(direction: Direction, from?: (message: LineMessage) => boolean): void;
  /** Lets the messages held going `direction` through, in order, and stops holding. */
  release(direction: Direction): void;
  /** The messages held going `direction`, oldest first. */
  held(direction: Direction): readonly LineMessage[];
  /**
   * The line goes down: the socket closes as a network drop closes it (the client hears `close`,
   * and nothing more from it), and every dial and request fails until `restore`. Messages held
   * on the dropped socket are lost.
   */
  drop(): void;
  /** The line is back: dials and requests go through again. */
  restore(): void;
  /** How many sockets the client has dialled, the ones that failed included. */
  readonly dials: number;
  /** How many HTTP requests the client has made, the ones that failed included. */
  readonly requests: number;
}

/** One socket the client dialled through the line. */
interface Line {
  dead: boolean;
  readonly handlers: SocketHandlers;
  send(text: string): void;
  close(): void;
}

/** What one direction holds: `null` when it isn't holding. */
interface Hold {
  from: ((message: LineMessage) => boolean) | null;
  queue: { line: Line; text: string }[] | null;
}

export function faultySocket(): FaultySocket {
  let down = false;
  let dials = 0;
  let requests = 0;
  let current: Line | null = null;
  const holds: Record<Direction, Hold> = {
    inbound: { from: null, queue: null },
    outbound: { from: null, queue: null },
  };

  /** Passes `text` going `direction` on `line`, or holds it. */
  const pass = (direction: Direction, line: Line, text: string, deliver: () => void) => {
    const hold = holds[direction];
    if (!hold.queue && hold.from?.(JSON.parse(text) as LineMessage)) hold.queue = [];
    if (hold.queue) hold.queue.push({ line, text });
    else deliver();
  };

  return {
    through: (connect) => (url, handlers) => {
      dials++;
      if (down) {
        // The dial fails, a moment after it's made, as a refused connection does.
        let closed = false;
        queueMicrotask(() => {
          if (!closed) handlers.close();
        });
        return {
          send: () => {},
          close: () => {
            closed = true;
          },
        };
      }
      let real: ReturnType<Connect> | null = null;
      const line: Line = {
        dead: false,
        handlers,
        send: (text) => real?.send(text),
        close: () => real?.close(),
      };
      real = connect(url, {
        open: () => {
          if (!line.dead) handlers.open();
        },
        message: (text) => {
          if (!line.dead) pass('inbound', line, text, () => handlers.message(text));
        },
        close: () => {
          if (line.dead) return;
          line.dead = true;
          handlers.close();
        },
      });
      current = line;
      return {
        send: (text) => {
          if (!line.dead) pass('outbound', line, text, () => line.send(text));
        },
        close: () => line.close(),
      };
    },
    fetchThrough: (fetch) => async (url, init) => {
      requests++;
      if (down) throw new TypeError('fetch failed');
      return fetch(url, init);
    },
    hold(direction, from) {
      const hold = holds[direction];
      hold.from = from ?? null;
      hold.queue = from ? null : [];
    },
    release(direction) {
      const hold = holds[direction];
      const due = hold.queue ?? [];
      hold.from = null;
      hold.queue = null;
      for (const { line, text } of due) {
        if (line.dead) continue;
        if (direction === 'inbound') line.handlers.message(text);
        else line.send(text);
      }
    },
    held: (direction) =>
      (holds[direction].queue ?? []).map(({ text }) => JSON.parse(text) as LineMessage),
    drop() {
      down = true;
      const line = current;
      if (!line || line.dead) return;
      line.dead = true;
      line.close();
      line.handlers.close();
    },
    restore() {
      down = false;
    },
    get dials() {
      return dials;
    },
    get requests() {
      return requests;
    },
  };
}
