import type { INestApplicationContext } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import type { GatewayLimits } from '../config';

/**
 * The event a client's message is handled as when it isn't one: not JSON, not `{ event, data }`,
 * or an `event` its WS gateway class has no handler for. Nest's `WsAdapter` would drop those
 * silently, but each counts toward closing the connection (design §11). No protocol message has a
 * `#`.
 */
export const INVALID_MESSAGE = '#invalid';

/** A socket message as `{ event, data }`, or as `INVALID_MESSAGE` if it isn't shaped like one. */
export function parseClientMessage(raw: unknown): { event: string; data: unknown } {
  try {
    const message: unknown = JSON.parse(String(raw));
    if (
      typeof message === 'object' &&
      message !== null &&
      'event' in message &&
      typeof message.event === 'string'
    ) {
      return { event: message.event, data: 'data' in message ? message.data : undefined };
    }
  } catch {
    // Not JSON.
  }
  return { event: INVALID_MESSAGE, data: undefined };
}

type WsAdapterOptions = NonNullable<ConstructorParameters<typeof WsAdapter>[1]>;
type Handlers = Parameters<WsAdapter['bindMessageHandler']>[1];
type Handler = Handlers extends Map<string, infer H> ? H : never;

/** A gateway's handlers by event, where an event it has no handler for gets `fallback`. */
class HandlersWithFallback extends Map<string, Handler> {
  constructor(
    handlers: Handlers,
    private readonly fallback: Handler,
  ) {
    super(handlers);
  }

  override get(event: string): Handler {
    return super.get(event) ?? this.fallback;
  }
}

/**
 * Nest's `WsAdapter` with the limits of the public socket (design §11): every message that isn't
 * one a WS gateway class handles reaches its `INVALID_MESSAGE` handler, if it has one, and the
 * largest message is `MAX_PAYLOAD_BYTES` (`ws` closes the connection with 1009 beyond it), which a
 * static `@WebSocketGateway` option couldn't take from the environment.
 */
export class ClientWsAdapter extends WsAdapter {
  readonly #maxPayload: number;
  /** Each client's handlers (Nest makes one map per client), with the fallback. */
  readonly #handlers = new WeakMap<Handlers, Handlers>();

  constructor(
    app: INestApplicationContext,
    limits: Pick<GatewayLimits, 'maxPayloadBytes'>,
    options: Omit<WsAdapterOptions, 'messageParser'> = {},
  ) {
    super(app, { ...options, messageParser: parseClientMessage });
    this.#maxPayload = limits.maxPayloadBytes;
  }

  override create(port: number, options: Parameters<WsAdapter['create']>[1] = {}) {
    return super.create(port, { ...options, maxPayload: this.#maxPayload });
  }

  override bindMessageHandler(
    ...[buffer, handlers, transform]: Parameters<WsAdapter['bindMessageHandler']>
  ): ReturnType<WsAdapter['bindMessageHandler']> {
    const invalid = handlers.get(INVALID_MESSAGE);
    if (!invalid) return super.bindMessageHandler(buffer, handlers, transform);
    let withFallback = this.#handlers.get(handlers);
    if (!withFallback) {
      withFallback = new HandlersWithFallback(handlers, invalid);
      this.#handlers.set(handlers, withFallback);
    }
    return super.bindMessageHandler(buffer, withFallback, transform);
  }
}
