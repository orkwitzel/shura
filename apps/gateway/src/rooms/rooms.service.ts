import { Inject, Injectable } from '@nestjs/common';
import {
  type ClientData,
  type GatewayToGameData,
  parseRoomCode,
  type RoomInfo,
  roomModeSchema,
  SEATS,
} from '@shura/protocol';
import type { RoomRecord, Stores } from '@shura/valkey';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { WebSocket } from 'ws';
import { type GatewayLimits, LIMITS } from '../config';
import { RoomLinksService, type RoomMember, type RoomPlace } from '../room-links';
import { type Connection, type ConnectionSession, ConnectionsService } from '../sessions';
import { STORES } from '../valkey';
import { claimRoomCode, createRoomMessage, placeRoom } from './placement';
import { REFUSE, roomNotFound } from './refusals';
import type { CreateRoomDto, JoinRoomDto } from './rooms.dto';

/** The room messages a client sends on to its room's pod as they are. */
type RoomEvent = 'leaveRoom' | 'ready' | 'startMatch' | 'rematch' | 'inputBatch';

/** Runs as a connection enters a room, by any way, in its turn. */
export type EnterListener = (connection: Connection) => Promise<void> | void;

/**
 * Rooms on the gateway (design §9.1, §10.1): creating one on the least-loaded game pod (§9.2),
 * joining one by code, leaving, and forwarding the room's messages both ways through its link
 * (`RoomLinksService`). The pod decides everything about the room itself. Every change runs in
 * the connection's turn (`ConnectionsService.inTurn`).
 */
@Injectable()
export class RoomsService {
  /** Each connection's place in its room's link. */
  readonly #members = new WeakMap<Connection, RoomMember>();
  readonly #enterListeners: EnterListener[] = [];

  constructor(
    @Inject(STORES) private readonly stores: Stores,
    @Inject(LIMITS) private readonly limits: GatewayLimits,
    private readonly connections: ConnectionsService,
    private readonly links: RoomLinksService,
    @InjectPinoLogger(RoomsService.name) private readonly logger: PinoLogger,
  ) {
    connections.onClose((connection) => this.#disconnected(connection));
  }

  /** `GET /api/rooms/:code` (design §8.7): the room's mode and how full it is. */
  async lookup(typed: string): Promise<RoomInfo> {
    const code = parseRoomCode(typed);
    const room = code === undefined ? undefined : await this.stores.registry.get(code);
    const mode = roomModeSchema.safeParse(room?.mode);
    if (code === undefined || !room || !mode.success) throw roomNotFound();
    return {
      code,
      mode: mode.data,
      seats: SEATS[mode.data],
      seated: room.seated,
      spectators: room.spectators,
    };
  }

  /**
   * A new room on the least-loaded pod (design §9.2), with this session as its host. A session is
   * in one room at a time, so it hosts at most one (design §11).
   */
  createRoom(socket: WebSocket, { mode }: CreateRoomDto): Promise<void> {
    return this.connections.inTurn(socket, async (connection) => {
      const session = this.#session(connection);
      if (connection.roomCode) throw REFUSE.inARoom();
      const pod = await placeRoom(this.stores.podHealth);
      if (!pod) throw REFUSE.noPod();
      const room: RoomRecord = {
        podAddress: pod.address,
        epoch: 0,
        mode,
        phase: 'lobby',
        hostId: session.id,
        seated: 0,
        spectators: 0,
      };
      const code = await claimRoomCode(this.stores.registry, room);
      if (code === undefined) throw REFUSE.noRoomCode();
      this.logger.info({ sessionId: session.id, roomCode: code, mode }, 'room created');
      await this.#enter(
        connection,
        code,
        room,
        createRoomMessage(code, { ...room, mode }, this.limits.maxSpectators),
      );
    });
  }

  /** Joins the room with the code typed (design §10.3), wherever its pod is. */
  joinRoom(socket: WebSocket, { code: typed }: JoinRoomDto): Promise<void> {
    return this.connections.inTurn(socket, async (connection) => {
      if (connection.roomCode) throw REFUSE.inARoom();
      const code = parseRoomCode(typed);
      const room = code === undefined ? undefined : await this.stores.registry.get(code);
      if (code === undefined || !room) throw REFUSE.noRoom();
      await this.#enter(connection, code, room);
    });
  }

  /** Leaves the room: on to its pod, then off its link. The pod sends nothing back. */
  leaveRoom(socket: WebSocket): Promise<void> {
    return this.connections.inTurn(socket, async (connection) => {
      this.#forward(connection, { event: 'leaveRoom', data: {} });
      await this.#exit(connection, { detach: false });
    });
  }

  ready(socket: WebSocket, data: ClientData<'ready'>): Promise<void> {
    return this.forward(socket, { event: 'ready', data });
  }

  startMatch(socket: WebSocket): Promise<void> {
    return this.forward(socket, { event: 'startMatch', data: {} });
  }

  /**
   * Puts the connection in the room `code` at `place`: `createRoom` first if `create` says so (a
   * pod ignores it for a room it has), then `attach`. Only in the connection's turn: for features
   * that open rooms of their own (`quick-match/`).
   */
  enter(
    connection: Connection,
    code: string,
    place: RoomPlace,
    create?: GatewayToGameData<'createRoom'>,
  ): Promise<void> {
    return this.#enter(connection, code, place, create);
  }

  /** Runs `listener` whenever a connection enters a room, before it does. */
  onEnter(listener: EnterListener): void {
    this.#enterListeners.push(listener);
  }

  /**
   * A room message on to the room's pod, as it is (`not_in_room` outside a room). For the
   * features whose messages the pod alone handles (`play/`).
   */
  forward<Event extends RoomEvent>(
    socket: WebSocket,
    message: { event: Event; data: ClientData<Event> },
  ): Promise<void> {
    return this.connections.inTurn(socket, (connection) => this.#forward(connection, message));
  }

  #forward<Event extends RoomEvent>(
    connection: Connection,
    { event, data }: { event: Event; data: ClientData<Event> },
  ): void {
    const session = this.#session(connection);
    const code = connection.roomCode;
    if (!code) throw REFUSE.notInRoom();
    this.links.forward(code, session.id, { event, data } as Parameters<
      RoomLinksService['forward']
    >[2]);
  }

  /** Into the room through its link, and into the session's record (for reconnects, §10.2). */
  async #enter(
    connection: Connection,
    code: string,
    place: RoomPlace,
    create?: GatewayToGameData<'createRoom'>,
  ): Promise<void> {
    const session = this.#session(connection);
    for (const listener of this.#enterListeners) await listener(connection);
    const member = this.#memberOf(connection, session);
    connection.roomCode = code;
    this.links.enter(
      code,
      place,
      member,
      { nickname: session.nickname, kind: session.kind },
      create,
    );
    await this.stores.sessions.update(session.token, { roomCode: code });
  }

  /** Out of the room: off its link (with a `detach` if the socket closed), and out of the session. */
  async #exit(connection: Connection, { detach }: { readonly detach: boolean }): Promise<void> {
    const code = connection.roomCode;
    const member = this.#members.get(connection);
    if (!code || !member || !connection.session) return;
    connection.roomCode = null;
    this.links.exit(code, member, { detach });
    // A closed socket keeps its room in the session: the seat is held for a reconnect (#64).
    if (!detach) await this.stores.sessions.update(connection.session.token, { roomCode: null });
  }

  #disconnected(connection: Connection): Promise<void> {
    return this.#exit(connection, { detach: true });
  }

  /** The connection's member of its room's link: what the pod's messages for it reach. */
  #memberOf(connection: Connection, session: ConnectionSession): RoomMember {
    let member = this.#members.get(connection);
    if (!member) {
      member = {
        sessionId: session.id,
        deliver: (event, data) => {
          this.connections.send(connection, { event, data } as Parameters<
            ConnectionsService['send']
          >[1]);
          // A quick-match room broke up (design §9.4): the pod has already taken the session out.
          if (event === 'opponentLeft') this.#brokenUp(connection);
        },
        lost: (code) => {
          this.connections
            .inTurn(connection.socket, (current) => {
              if (current.roomCode !== code) return;
              current.roomCode = null;
              this.connections.send(current, {
                event: 'exception',
                data: { code: 'room_not_found', message: "The room's server went away." },
              });
            })
            .catch(() => {});
        },
      };
      this.#members.set(connection, member);
    }
    return member;
  }

  /** Off the link of a room the pod took the connection out of, in the connection's turn. */
  #brokenUp(connection: Connection): void {
    const code = connection.roomCode;
    this.connections
      .inTurn(connection.socket, async (current) => {
        if (current.roomCode === code) await this.#exit(current, { detach: false });
      })
      .catch((error: unknown) => this.logger.warn({ err: error }, 'leaving a broken-up room'));
  }

  #session(connection: Connection): ConnectionSession {
    // SessionGuard has let the message through, so the hello succeeded.
    if (!connection.session) throw new Error('a room message before hello');
    return connection.session;
  }
}
