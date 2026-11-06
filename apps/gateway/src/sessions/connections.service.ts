import { Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { type ErrorBody, errorBody, type PlayerKind, type ServerMessage } from '@shura/protocol';
import type { SessionRecord } from '@shura/valkey';
import PQueue from 'p-queue';
import { WebSocket } from 'ws';
import type { RoomMember } from '../room-links';

/** Who a connection is, once its `hello` has been accepted (design §10.2). */
export interface ConnectionSession {
  readonly id: string;
  /** The token it said hello with, which keys its record in the `SessionStore`. */
  readonly token: string;
  nickname: string;
  readonly kind: PlayerKind;
}

/** One client's socket, as the gateway's features know it. */
export interface Connection {
  readonly socket: WebSocket;
  /** Set once its `hello` succeeds. */
  session: ConnectionSession | null;
  /** The room it's in, whose traffic goes over that room's link (`RoomLinksService`). */
  roomCode: string | null;
  /**
   * Its member of its rooms' links (`rooms/`): what the pods' messages for it reach. Made on its
   * first room and kept, so a link always knows it as the same member.
   */
  roomMember: RoomMember | null;
  /** While it waits for a quick match (`quick-match/`): stops listening for its pairing notice. */
  stopWaiting: (() => Promise<void>) | null;
  /** Whether the socket has closed. Work still queued for it should do nothing visible. */
  closed: boolean;
}

/**
 * The session of a connection whose `hello` succeeded: every message past `SessionGuard`'s, so a
 * missing one is a bug.
 */
export function sessionOf(connection: Connection): ConnectionSession {
  if (!connection.session) throw new Error('a session message before hello');
  return connection.session;
}

/** Runs as a connection closes, in its turn after every message before the close. */
export type CloseListener = (connection: Connection) => Promise<void> | void;

/**
 * Runs once a connection's `hello` is welcomed, in the same turn, so before any message after the
 * `hello`: with the session's record as it was, its room included (design §10.2).
 */
export type WelcomeListener = (
  connection: Connection,
  record: SessionRecord,
) => Promise<void> | void;

/**
 * Every open client socket and what the gateway knows of it (`Connection`), by socket: nothing is
 * stored on the socket itself.
 *
 * Each connection has one serial queue (`inTurn`). Nest hands a socket's messages over one at a
 * time (`maxConcurrentMessages: 1`), but not its close, a room link's delivery that changes the
 * connection, or a pub/sub notice: features run all of those, and their message handling, in the
 * connection's turn, so none overtakes another.
 */
@Injectable()
export class ConnectionsService {
  readonly #connections = new WeakMap<WebSocket, { connection: Connection; queue: PQueue }>();
  readonly #closeListeners: CloseListener[] = [];
  readonly #welcomeListeners: WelcomeListener[] = [];

  /** A client's socket opened. */
  open(socket: WebSocket): void {
    this.#connections.set(socket, {
      connection: {
        socket,
        session: null,
        roomCode: null,
        roomMember: null,
        stopWaiting: null,
        closed: false,
      },
      queue: new PQueue({ concurrency: 1 }),
    });
  }

  /** The connection of `socket`, if it's open. */
  get(socket: WebSocket): Connection | undefined {
    return this.#connections.get(socket)?.connection;
  }

  /**
   * Runs `task` on the connection once everything queued before it is done, and gives its result.
   * A socket the gateway doesn't know (already gone) runs nothing.
   */
  inTurn<T>(socket: WebSocket, task: (connection: Connection) => Promise<T> | T): Promise<T> {
    const entry = this.#connections.get(socket);
    if (!entry) return Promise.reject(new WsException(errorBody('session_required')));
    return entry.queue.add(() => task(entry.connection)) as Promise<T>;
  }

  /** Runs `listener` for each connection as it closes. */
  onClose(listener: CloseListener): void {
    this.#closeListeners.push(listener);
  }

  /** Runs `listener` for each connection once its `hello` is welcomed. */
  onWelcome(listener: WelcomeListener): void {
    this.#welcomeListeners.push(listener);
  }

  /** The connection's `hello` was welcomed as `record`'s session: only in the connection's turn. */
  async welcomed(connection: Connection, record: SessionRecord): Promise<void> {
    for (const listener of this.#welcomeListeners) await listener(connection, record);
  }

  /** The socket closed: the close listeners run in the connection's turn, then it's forgotten. */
  async close(socket: WebSocket): Promise<void> {
    const entry = this.#connections.get(socket);
    if (!entry) return;
    await entry.queue.add(async () => {
      entry.connection.closed = true;
      for (const listener of this.#closeListeners) await listener(entry.connection);
    });
    this.#connections.delete(socket);
  }

  /** Sends `message` to the connection's client, if its socket is still open. */
  send(connection: Pick<Connection, 'socket'>, message: ServerMessage): void {
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(message));
    }
  }

  /** Sends `exception` and closes the socket: for a `hello` the server won't take. */
  refuse(connection: Pick<Connection, 'socket'>, { code, message }: ErrorBody): void {
    this.send(connection, { event: 'exception', data: { code, message } });
    connection.socket.close();
  }
}
