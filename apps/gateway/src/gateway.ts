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
import type { Logger } from './logger';
import type { DialGame, Peer } from './peer';
import { placeRoom, randomRoomCode } from './placement';
import { RoomLinks, type RoomMember } from './room-links';
import { restoreSession } from './sessions';

/** How many random codes a new room tries before giving up. 920k codes make a clash rare. */
const CODE_TRIES = 10;

export interface GatewayOptions {
  readonly clock: ServerClock;
  readonly stores: Pick<Stores, 'registry' | 'sessions' | 'podHealth'>;
  /** Opens the internal link to a game pod. */
  readonly dial: DialGame;
  readonly logger: Logger;
}

/** The gateway (design §9.1): players' WebSockets, and their rooms' traffic forwarded to pods. */
export interface Gateway {
  /** A player's WebSocket, from `ip`. */
  accept(socket: Peer, ip: string): void;
}

export function createGateway(options: GatewayOptions): Gateway {
  const links = new RoomLinks(options.dial, options.logger);
  return {
    accept(socket, ip) {
      // #66 checks the per-IP connection limits here, before the connection does anything.
      new Connection(socket, ip, options, links);
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
 * slow store call can't let a later message overtake an earlier one. A `hello` with a session
 * token comes back as that session, into its room (design §10.2).
 *
 * Seams for later tickets:
 * - #65: `quickMatch` and `cancelQuickMatch`, and cancelling the queue entry on close;
 * - #66: the message-rate bucket and the invalid-message count in `#receive`, and the room limits
 *   in `#createRoom` and `#joinRoom`.
 */
class Connection implements RoomMember {
  readonly #socket: Peer;
  readonly #options: GatewayOptions;
  readonly #links: RoomLinks;
  readonly #logger: Logger;
  #session: Session | null = null;
  #roomCode: string | null = null;
  #queue: Promise<void> = Promise.resolve();
  #closed = false;

  constructor(socket: Peer, ip: string, options: GatewayOptions, links: RoomLinks) {
    this.#socket = socket;
    this.#options = options;
    this.#links = links;
    this.#logger = options.logger.child({ ip });
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
    const message = parse(text);
    if (!message) return this.#send(error('invalid_message', "That message isn't valid."));
    if (message.type === 'hello') return this.#hello(message);
    const session = this.#session;
    if (!session) return this.#send(error('invalid_message', 'Say hello first.'));
    switch (message.type) {
      case 'ping':
        return this.#send({ type: 'pong', id: message.id, serverTime: this.#options.clock.now() });
      case 'createRoom':
        return this.#createRoom(session, message.mode);
      case 'joinRoom':
        return this.#joinRoom(session, message.code);
      case 'quickMatch':
      case 'cancelQuickMatch':
        return this.#send(error('wrong_phase', "Quick match isn't available yet."));
      case 'setNickname':
        return this.#setNickname(session, message.nickname);
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
    const kind = message.kind ?? 'guest';
    const restored = message.sessionToken
      ? await restoreSession(this.#options.stores, message.sessionToken, kind)
      : undefined;
    const nickname = validateNickname(message.nickname);
    if (!restored && !nickname.ok) {
      this.#send(error('nickname_invalid', `That nickname can't be used (${nickname.reason}).`));
      return this.#socket.close();
    }
    const session: Session = restored?.session ?? {
      id: randomUUID(),
      token: randomBytes(24).toString('base64url'),
      nickname: nickname.ok ? nickname.nickname : '',
      kind,
    };
    if (!restored) {
      await this.#options.stores.sessions.create(session.token, {
        sessionId: session.id,
        nickname: session.nickname,
      });
    }
    this.#session = session;
    this.#logger.info({ sessionId: session.id, kind, restored: !!restored }, 'hello');
    this.#send({
      type: 'welcome',
      sessionId: session.id,
      sessionToken: session.token,
      nickname: session.nickname,
      serverTime: this.#options.clock.now(),
    });
    // Back as a session that was in a room: into its seat again (design §10.2), before any message
    // that follows the hello, such as the batches sent again, is handled.
    if (restored?.roomCode) await this.#reenter(session, restored.roomCode);
  }

  /**
   * A new nickname, in the lobby (design §10.2): normalised and checked here as at `hello`, then
   * on to the room, which refuses it outside the lobby and adds the `#2` of a duplicate.
   */
  async #setNickname(session: Session, typed: string): Promise<void> {
    const nickname = validateNickname(typed);
    if (!nickname.ok) {
      return this.#send(
        error('nickname_invalid', `That nickname can't be used (${nickname.reason}).`),
      );
    }
    if (!this.#roomCode) return this.#send(error('not_in_room', "You're not in a room."));
    session.nickname = nickname.nickname;
    await this.#options.stores.sessions.update(session.token, { nickname: nickname.nickname });
    return this.#forward(session, { type: 'setNickname', nickname: nickname.nickname });
  }

  /** The room a restored session was in, if it's still there; its pod holds the seat. */
  async #reenter(session: Session, code: string): Promise<void> {
    const room = await this.#options.stores.registry.get(code);
    if (room) return this.#enter(session, code, room);
    await this.#options.stores.sessions.update(session.token, { roomCode: null });
    this.#send(error('room_not_found', 'Your room is gone.'));
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
    this.#links.exit(code, this, { detach: false });
    await this.#options.stores.sessions.update(session.token, { roomCode: null });
  }

  async #close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const session = this.#session;
    if (session && this.#roomCode) {
      this.#links.exit(this.#roomCode, this, { detach: true });
    }
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
