import { Inject, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { errorBody, roomModeSchema } from '@shura/protocol';
import type { MatchedNotice, RoomRecord, Stores } from '@shura/valkey';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { WebSocket } from 'ws';
import { type GatewayLimits, LIMITS } from '../config';
import { claimRoomCode, createRoomMessage, placeRoom, REFUSE, RoomsService } from '../rooms';
import { type Connection, type ConnectionSession, ConnectionsService } from '../sessions';
import { STORES } from '../valkey';

/** `qm:cooldown`: a session that left the queue asked to rejoin it too soon (design §9.4). */
const coolingDown = (retryAfterMs: number) =>
  new WsException(
    errorBody('rate_limited', `Wait ${Math.ceil(retryAfterMs / 1000)} s before queueing again.`),
  );

/**
 * The 1v1 quick-match queue on the gateway (design §9.4). `quickMatch` pairs the session with
 * whoever has waited longest, creating their room (no host) on the least-loaded pod and entering
 * it, or queues it and listens for the pairing gateway's notice. The notice comes through pub/sub
 * even when the pairing gateway is this one, so pairing across gateways is the only path.
 *
 * A session leaves the queue, with the requeue cooldown, when it cancels, when its connection
 * closes, and when it enters a room some other way. Being paired starts no cooldown. Everything
 * runs in the connection's turn (`ConnectionsService.inTurn`), notices included.
 */
@Injectable()
export class QuickMatchService {
  /** Each waiting connection's way to stop listening for its matched notice. */
  readonly #waiting = new WeakMap<Connection, () => Promise<void>>();

  constructor(
    @Inject(STORES) private readonly stores: Stores,
    @Inject(LIMITS) private readonly limits: GatewayLimits,
    private readonly connections: ConnectionsService,
    private readonly rooms: RoomsService,
    @InjectPinoLogger(QuickMatchService.name) private readonly logger: PinoLogger,
  ) {
    connections.onClose((connection) => this.#leave(connection));
    // Into a room by any way, the session stops waiting for a quick match.
    rooms.onEnter((connection) => this.#leave(connection));
  }

  /** `quickMatch`: paired at once, or queued (`quickMatchQueued`). Asking again changes nothing. */
  quickMatch(socket: WebSocket): Promise<void> {
    return this.connections.inTurn(socket, async (connection) => {
      const session = sessionOf(connection);
      if (connection.roomCode) throw REFUSE.inARoom();
      // A pod is chosen before the queue is touched, so a partner is never popped with nowhere to go.
      const pod = await placeRoom(this.stores.podHealth);
      if (!pod) throw REFUSE.noPod();
      const { matchQueue } = this.stores;
      // Listening starts before queueing, so a pairing that follows at once is heard.
      if (!this.#waiting.has(connection)) {
        const stop = await matchQueue.onMatched(session.id, (notice) => {
          this.connections
            .inTurn(socket, (current) => this.#matched(current, notice))
            .catch((error: unknown) => this.logger.warn({ err: error }, 'quick-match notice'));
        });
        this.#waiting.set(connection, stop);
      }
      const result = await matchQueue.quickMatch(session.id);
      switch (result.status) {
        case 'queued':
        case 'alreadyQueued':
          this.connections.send(connection, { event: 'quickMatchQueued', data: {} });
          return;
        case 'coolingDown':
          await this.#stopListening(connection);
          throw coolingDown(result.retryAfterMs);
        case 'matched':
          await this.#stopListening(connection);
          await this.#pair(connection, session, result.partnerId, pod.address);
          return;
      }
    });
  }

  /** `cancelQuickMatch`: out of the queue, with the requeue cooldown (`quickMatchCancelled`). */
  cancelQuickMatch(socket: WebSocket): Promise<void> {
    return this.connections.inTurn(socket, async (connection) => {
      await this.#leave(connection);
      this.connections.send(connection, { event: 'quickMatchCancelled', data: {} });
    });
  }

  /** `rematch`, in a quick-match room after results: on to the room's pod. */
  rematch(socket: WebSocket): Promise<void> {
    return this.rooms.forward(socket, { event: 'rematch', data: {} });
  }

  /**
   * Paired with `partnerId`: their room, with no host, on the pod at `podAddress`, entered first by
   * this session; then the partner's gateway, wherever it is, is told.
   */
  async #pair(
    connection: Connection,
    session: ConnectionSession,
    partnerId: string,
    podAddress: string,
  ): Promise<void> {
    const room: RoomRecord = {
      podAddress,
      epoch: 0,
      mode: '1v1',
      phase: 'lobby',
      quickMatch: true,
      seated: 0,
      spectators: 0,
    };
    const code = await claimRoomCode(this.stores.registry, room);
    // The partner is out of the queue; their room never comes, and both can ask again.
    if (code === undefined) throw REFUSE.noRoomCode();
    this.logger.info({ sessionId: session.id, partnerId, roomCode: code }, 'quick-match paired');
    await this.rooms.enter(
      connection,
      code,
      room,
      createRoomMessage(code, { ...room, mode: '1v1' }, this.limits.maxSpectators),
    );
    await this.stores.matchQueue.notifyMatched({
      sessionId: partnerId,
      partnerId: session.id,
      roomCode: code,
    });
  }

  /**
   * The pairing gateway paired this waiting session: into the room it created. `createRoom` goes
   * again before `attach` (the pod ignores it for a room it has), so the two gateways' links can
   * reach the pod in either order.
   */
  async #matched(connection: Connection, { roomCode, partnerId }: MatchedNotice): Promise<void> {
    if (!this.#waiting.has(connection)) return;
    await this.#stopListening(connection);
    // The room breaks up by itself if its second player never arrives (design §9.4).
    if (connection.closed || connection.roomCode || !connection.session) return;
    const room = await this.stores.registry.get(roomCode);
    const mode = roomModeSchema.safeParse(room?.mode);
    if (!room || !mode.success) return;
    this.logger.info(
      { sessionId: connection.session.id, partnerId, roomCode },
      'quick-match paired',
    );
    await this.rooms.enter(
      connection,
      roomCode,
      room,
      createRoomMessage(roomCode, { ...room, mode: mode.data }, this.limits.maxSpectators),
    );
  }

  /** Takes the session out of the queue, if it's waiting, with the requeue cooldown. */
  async #leave(connection: Connection): Promise<void> {
    if (!this.#waiting.has(connection) || !connection.session) return;
    await this.stores.matchQueue.cancel(connection.session.id);
    await this.#stopListening(connection);
  }

  async #stopListening(connection: Connection): Promise<void> {
    const stop = this.#waiting.get(connection);
    this.#waiting.delete(connection);
    await stop?.();
  }
}

function sessionOf(connection: Connection): ConnectionSession {
  // SessionGuard has let the message through, so the hello succeeded.
  if (!connection.session) throw new Error('a quick-match message before hello');
  return connection.session;
}
