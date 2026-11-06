import type { IncomingMessage } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import { type ErrorBody, errorBody } from '@shura/protocol';
import { type BucketState, refill, type TokenBucket } from '@shura/valkey';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { WebSocket } from 'ws';
import { CLOCK, type Clock } from '../clock';
import { type GatewayLimits, LIMITS } from '../config';
import { CONNECTION_COUNT_TTL_MS, IpLimitsService } from './ip-limits.service';

/** What a message arriving on a connection does to its rate bucket. */
export type MessageRate = 'allowed' | 'refused' | 'dropped';

/** One connection's limits. */
interface ConnectionState {
  readonly ip: string;
  bucket: BucketState;
  /** Whether the last message was refused, so the next refusals go unanswered. */
  refusing: boolean;
  invalid: number;
  /**
   * Settles once the connection limits have let the connection in, with what to do as it closes
   * (release its IP's count), or `null` if there's nothing to do.
   */
  readonly admitted: Promise<(() => void) | null>;
}

/**
 * The limits of each client socket (design §11). Its IP's connection limits, checked as it opens
 * (`ClientGateway.handleConnection`, where guards don't run) and counted until it closes. And its
 * own, which no address is exempt from: the message-rate bucket and the invalid-message count.
 * They're kept by the socket's own gateway, since the socket lives there.
 */
@Injectable()
export class ConnectionLimitsService {
  readonly #states = new WeakMap<WebSocket, ConnectionState>();
  readonly #bucket: TokenBucket;

  constructor(
    private readonly ips: IpLimitsService,
    @Inject(LIMITS) private readonly limits: GatewayLimits,
    @Inject(CLOCK) private readonly clock: Clock,
    @InjectPinoLogger(ConnectionLimitsService.name) private readonly logger: PinoLogger,
  ) {
    this.#bucket = { capacity: limits.messageBurst, refillPerSecond: limits.messagesPerSecond };
  }

  /**
   * A client socket opened: lets it in if its IP is under the connection limits, counting it, or
   * refuses it with `too_many_connections` and closes it. Settles once that's decided, so the
   * connection's first turn waits for it. Without Valkey there's nothing to count with, so the
   * connection goes in uncounted.
   */
  admit(socket: WebSocket, request: IncomingMessage): Promise<void> {
    const ip = this.ips.ipOf(request);
    const admitted = this.ips.isExempt(ip) ? Promise.resolve(null) : this.#count(socket, ip);
    this.#states.set(socket, {
      ip,
      bucket: { tokens: this.limits.messageBurst, at: this.clock.now() },
      refusing: false,
      invalid: 0,
      admitted,
    });
    return admitted.then(() => undefined);
  }

  /** The socket closed: its IP's count goes down once it's been counted. */
  closed(socket: WebSocket): Promise<void> {
    return (this.#states.get(socket)?.admitted ?? Promise.resolve(null)).then((release) =>
      release?.(),
    );
  }

  /** The client's address, as the per-IP limits know it. */
  ipOf(socket: WebSocket): string | undefined {
    return this.#states.get(socket)?.ip;
  }

  /**
   * Takes a message from the connection's token bucket. The first message refused in a row is
   * `refused` and gets `rate_limited`; the rest are `dropped` without an answer, so a flood isn't
   * answered with one.
   */
  message(socket: WebSocket): MessageRate {
    const state = this.#states.get(socket);
    if (!state) return 'allowed';
    const { take, state: bucket } = refill(this.#bucket, state.bucket, this.clock.now());
    state.bucket = bucket;
    if (take.allowed) {
      state.refusing = false;
      return 'allowed';
    }
    if (state.refusing) return 'dropped';
    state.refusing = true;
    return 'refused';
  }

  /**
   * An invalid message: not JSON, not a message the protocol has, or failing its schema. It gets
   * `invalid_message`, and enough of them close the connection.
   */
  invalid(socket: WebSocket, body: ErrorBody = errorBody('invalid_message')): void {
    send(socket, body);
    const state = this.#states.get(socket);
    if (!state) return;
    state.invalid++;
    if (state.invalid >= this.limits.invalidMessagesBeforeDisconnect) {
      this.logger.info({ ip: state.ip }, 'closed after invalid messages');
      socket.close();
    }
  }

  async #count(socket: WebSocket, ip: string): Promise<(() => void) | null> {
    let admitted: boolean;
    try {
      admitted = await this.ips.admitConnection(ip);
    } catch (cause) {
      this.logger.error({ err: cause, ip }, 'connection limits failed');
      return null;
    }
    if (!admitted) {
      this.logger.info({ ip }, 'connection refused');
      send(socket, errorBody('too_many_connections'));
      socket.close();
      return null;
    }
    return this.#keepCounted(ip);
  }

  /** Keeps `ip`'s count of one connection alive. Returns what to do once it closes. */
  #keepCounted(ip: string): () => void {
    const failed = (cause: unknown) =>
      this.logger.error({ err: cause, ip }, 'connection count failed');
    const stop = this.clock.every(CONNECTION_COUNT_TTL_MS / 2, () => {
      this.ips.refreshConnection(ip).catch(failed);
    });
    return () => {
      stop();
      this.ips.releaseConnection(ip).catch(failed);
    };
  }
}

const send = (socket: WebSocket, body: ErrorBody) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ event: 'exception', data: body }));
  }
};
