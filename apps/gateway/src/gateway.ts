import { randomBytes, randomUUID } from 'node:crypto';
import { ENGINE_VERSION } from '@shura/engine';
import {
  type ClientMessage,
  type ClientMessageOf,
  clientMessageSchema,
  type ErrorCode,
  type PlayerKind,
  PROTOCOL_VERSION,
  parseRoomCode,
  type RoomMode,
  type ServerMessage,
  validateNickname,
} from '@shura/protocol';
import type { Stores } from '@shura/valkey';
import type { ServerClock } from './clock';
import { type ConnectionLimits, DEFAULT_LIMITS, type GatewayLimits, Limits } from './limits';
import type { Logger } from './logger';
import type { DialGame, Peer } from './peer';
import { placeRoom, randomRoomCode } from './placement';
import { QuickMatching } from './quick-match';
import { RoomLinks, type RoomMember } from './room-links';

/** How many random codes a new room tries before giving up. 920k codes make a clash rare. */
const CODE_TRIES = 10;

export interface GatewayOptions {
  readonly clock: ServerClock;
  readonly stores: Pick<
    Stores,
    'registry' | 'sessions' | 'podHealth' | 'matchQueue' | 'rateLimiter'
  >;
  /** Opens the internal link to a game pod. */
  readonly dial: DialGame;
  readonly logger: Logger;
  /** The abuse limits (design §11), each defaulting to the design's value. */
  readonly limits?: Partial<GatewayLimits>;
}

/** The gateway (design §9.1): players' WebSockets, and their rooms' traffic forwarded to pods. */
export interface Gateway {
  /** A player's WebSocket, from `ip`. */
  accept(socket: Peer, ip: string): void;
}

export function createGateway(options: GatewayOptions): Gateway {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const links = new RoomLinks(options.dial, options.logger, {
    maxSpectators: limits.maxSpectators,
  });
  const guard = new Limits({
    limits,
    rateLimiter: options.stores.rateLimiter,
    registry: options.stores.registry,
    clock: options.clock,
    logger: options.logger,
  });
  return {
    accept(socket, ip) {
      // The per-IP connection limits come first: until they pass, the connection hears nothing.
      new Connection(guard.admit(socket, ip), ip, options, links, guard.connection(ip));
    },
  };
}

/** Who a connection is, once its `hello` has been accepted. */
interface Session {
  readonly id: string;
  readonly token: string;
  nickname: string;
  readonly kind: PlayerKind;
}

/**
 * One player's WebSocket: the `hello` and version check (design §8.3), the ping, the room
 * messages, and the room's traffic both ways. Messages are handled one at a time, in order, so a
 * slow store call can't let a later message overtake an earlier one.
 *
 * Seams for later tickets:
 * - #64: `hello` with a `sessionToken` restores the session (and its room) instead of a new one;
 *
 * Its abuse limits (design §11) are in `#receive`: the message-rate bucket, the invalid-message
 * count, and the room limits around `#createRoom` and `#joinRoom`.
 */
class Connection implements RoomMember {
  readonly #socket: Peer;
  readonly #options: GatewayOptions;
  readonly #links: RoomLinks;
  readonly #logger: Logger;
  readonly #limits: ConnectionLimits;
  #session: Session | null = null;
  #roomCode: string | null = null;
  #queue: Promise<void> = Promise.resolve();
  #closed = false;
  readonly #quickMatching: QuickMatching;

  constructor(
    socket: Peer,
    ip: string,
    options: GatewayOptions,
    links: RoomLinks,
    limits: ConnectionLimits,
  ) {
    this.#socket = socket;
    this.#limits = limits;
    this.#options = options;
    this.#links = links;
    this.#logger = options.logger.child({ ip });
    this.#quickMatching = new QuickMatching(options.stores, this.#logger, {
      sessionId: () => this.sessionId,
      busy: () => this.#closed || this.#roomCode !== null,
      send: (message) => this.#send(message),
      inTurn: (task) => {
        this.#queue = this.#queue.then(task).catch(this.#failed);
      },
      enter: async (code, room, create) => {
        if (this.#session) await this.#enter(this.#session, code, room, create);
      },
    });
    socket.listen({
      message: (text) => {
        this.#queue = this.#queue.then(() => this.#receive(text)).catch(this.#failed);
      },
      close: () => {
        this.#queue = this.#queue.then(() => this.#close()).catch(this.#failed);
      },
    });
  }

  get sessionId(): string {
    return this.#session?.id ?? '';
  }

  deliver(message: ServerMessage): void {
    this.#send(message);
    // The quick-match room broke up: the game pod already took this session out of it.
    if (message.type === 'opponentLeft') {
      this.#queue = this.#queue.then(() => this.#leftRoom()).catch(this.#failed);
    }
  }

  lost(roomCode: string): void {
    if (this.#roomCode !== roomCode) return;
    this.#roomCode = null;
    this.#send(error('room_not_found', "The room's server went away."));
  }

  #failed = (cause: unknown): void => {
    this.#logger.error({ err: cause, sessionId: this.#session?.id }, 'message handling failed');
  };

  async #receive(text: string): Promise<void> {
    if (this.#closed) return;
    const rate = this.#limits.message();
    if (rate === 'refused') return this.#send(this.#limits.tooFast);
    if (rate === 'dropped') return;
    const message = parse(text);
    if (!message) {
      this.#send(error('invalid_message', "That message isn't valid."));
      if (this.#limits.invalid()) {
        this.#logger.info({ sessionId: this.#session?.id }, 'too many invalid messages');
        this.#socket.close();
      }
      return;
    }
    if (message.type === 'hello') return this.#hello(message);
    const session = this.#session;
    if (!session) return this.#send(error('invalid_message', 'Say hello first.'));
    switch (message.type) {
      case 'ping':
        return this.#send({ type: 'pong', id: message.id, serverTime: this.#options.clock.now() });
      case 'createRoom': {
        const refusal = await this.#limits.createRoom(session.id, this.#roomCode);
        return refusal ? this.#send(refusal) : this.#createRoom(session, message.mode);
      }
      case 'joinRoom': {
        const refusal = await this.#limits.joinRoom();
        if (refusal) return this.#send(refusal);
        await this.#joinRoom(session, message.code);
        if (!this.#roomCode) await this.#limits.joinFailed();
        return;
      }
      case 'quickMatch':
        return this.#quickMatching.request();
      case 'cancelQuickMatch':
        return this.#quickMatching.cancel();
      default:
        return this.#forward(session, message);
    }
  }

  /** The version check (ADR 0006), then a new session with its token (design §10.2). */
  async #hello(message: ClientMessageOf<'hello'>): Promise<void> {
    if (this.#session) return this.#send(error('invalid_message', 'Hello was already said.'));
    if (message.protocolVersion !== PROTOCOL_VERSION || message.engineVersion !== ENGINE_VERSION) {
      this.#logger.info(
        { protocolVersion: message.protocolVersion, engineVersion: message.engineVersion },
        'version mismatch',
      );
      this.#send(
        error('version_mismatch', 'A new version of Shura is out: update to play online.'),
      );
      return this.#socket.close();
    }
    const nickname = validateNickname(message.nickname);
    if (!nickname.ok) {
      this.#send(error('nickname_invalid', `That nickname can't be used (${nickname.reason}).`));
      return this.#socket.close();
    }
    const session: Session = {
      id: randomUUID(),
      token: randomBytes(24).toString('base64url'),
      nickname: nickname.nickname,
      kind: message.kind ?? 'guest',
    };
    await this.#options.stores.sessions.create(session.token, {
      sessionId: session.id,
      nickname: session.nickname,
    });
    this.#session = session;
    this.#logger.info({ sessionId: session.id, kind: session.kind }, 'hello');
    this.#send({
      type: 'welcome',
      sessionId: session.id,
      sessionToken: session.token,
      nickname: session.nickname,
      serverTime: this.#options.clock.now(),
    });
  }

  /** A new room on the least-loaded pod (design §9.2), with this session as its host. */
  async #createRoom(session: Session, mode: RoomMode): Promise<void> {
    if (this.#roomCode) return this.#send(error('wrong_phase', 'Leave your room first.'));
    const { registry, podHealth } = this.#options.stores;
    const pod = await placeRoom(podHealth);
    if (!pod) return this.#send(error('unavailable', 'No game server can take a room right now.'));
    for (let tries = 0; tries < CODE_TRIES; tries++) {
      const code = randomRoomCode();
      const room = {
        podAddress: pod.address,
        epoch: 0,
        mode,
        phase: 'lobby' as const,
        hostId: session.id,
      };
      if (!(await registry.create(code, room))) continue;
      this.#logger.info({ sessionId: session.id, roomCode: code, mode }, 'room created');
      return this.#enter(session, code, room, {
        type: 'createRoom',
        roomCode: code,
        epoch: 0,
        mode,
        hostId: session.id,
      });
    }
    this.#send(error('unavailable', "Couldn't find a free room code. Try again."));
  }

  async #joinRoom(session: Session, typed: string): Promise<void> {
    if (this.#roomCode) return this.#send(error('wrong_phase', 'Leave your room first.'));
    const code = parseRoomCode(typed);
    const room = code === undefined ? undefined : await this.#options.stores.registry.get(code);
    if (code === undefined || !room) {
      return this.#send(error('room_not_found', 'No room with that code.'));
    }
    return this.#enter(session, code, room);
  }

  async #enter(
    session: Session,
    code: string,
    room: { podAddress: string; epoch: number },
    create?: Parameters<RoomLinks['enter']>[4],
  ): Promise<void> {
    // Into a room by any way, the session stops waiting for a quick match.
    await this.#quickMatching.leave();
    this.#roomCode = code;
    this.#links.enter(code, room, this, { nickname: session.nickname, kind: session.kind }, create);
    await this.#options.stores.sessions.update(session.token, { roomCode: code });
  }

  /** A room-scoped message, on to the room's pod; leaving the room also leaves its link. */
  async #forward(session: Session, message: ClientMessage): Promise<void> {
    const code = this.#roomCode;
    if (!code) return this.#send(error('not_in_room', "You're not in a room."));
    this.#links.forward(code, session.id, {
      type: 'room',
      roomCode: code,
      epoch: this.#links.epochOf(code),
      sessionId: session.id,
      message,
    });
    if (message.type !== 'leaveRoom') return;
    this.#roomCode = null;
    this.#links.exit(code, session.id, { detach: false });
    await this.#options.stores.sessions.update(session.token, { roomCode: null });
  }

  /** Out of the quick-match room the pod broke up: off its link, and out of the session. */
  async #leftRoom(): Promise<void> {
    const code = this.#roomCode;
    const session = this.#session;
    if (!code || !session) return;
    this.#roomCode = null;
    this.#links.exit(code, session.id, { detach: false });
    await this.#options.stores.sessions.update(session.token, { roomCode: null });
  }

  async #close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const session = this.#session;
    if (session && this.#roomCode) {
      this.#links.exit(this.#roomCode, session.id, { detach: true });
    }
    await this.#quickMatching.leave();
    this.#logger.info({ sessionId: session?.id }, 'connection closed');
  }

  #send(message: ServerMessage): void {
    if (!this.#closed) this.#socket.send(JSON.stringify(message));
  }
}

function error(code: ErrorCode, message: string): ServerMessage {
  return { type: 'error', code, message };
}

function parse(text: string): ClientMessage | undefined {
  try {
    const result = clientMessageSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
