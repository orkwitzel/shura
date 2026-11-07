import { Inject, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { errorBody, type RoomMode, roomModeSchema } from '@shura/protocol';
import type { MatchedNotice, RoomRecord, Stores } from '@shura/valkey';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { WebSocket } from 'ws';
import { type GatewayLimits, LIMITS } from '../config';
import { claimRoomCode, createRoomMessage, placeRoom, REFUSE, RoomsService } from '../rooms';
import { type Connection, ConnectionsService, sessionOf } from '../sessions';
import { STORES } from '../valkey';

/** `qm:cooldown`: a session that left the queue asked to rejoin it too soon (design §9.4). */
const coolingDown = (retryAfterMs: number) =>
  new WsException(
    errorBody('rate_limited', `Wait ${Math.ceil(retryAfterMs / 1000)} s before queueing again.`),
  );

/** The registry record of a new quick-match room on the pod at `podAddress`: 1v1, no host. */
const quickMatchRoom = (podAddress: string): RoomRecord => ({
  podAddress,
  epoch: 0,
  mode: '1v1',
  phase: 'lobby',
  quickMatch: true,
  seated: 0,
  spectators: 0,
});

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
      // The pod and the room code are settled before the queue is touched, so a partner is never
      // popped with nowhere to go. The code goes back unless a partner was popped for it.
      const pod = await placeRoom(this.stores.podHealth);
      if (!pod) throw REFUSE.noPod();
      const { matchQueue, registry } = this.stores;
      const room = quickMatchRoom(pod.address);
      const code = await claimRoomCode(registry, room);
      if (code === undefined) throw REFUSE.noRoomCode();
      let paired = false;
      try {
        // Listening starts before queueing, so a pairing that follows at once is heard.
        connection.stopWaiting ??= await matchQueue.onMatched(session.id, (notice) => {
          this.connections
            .inTurn(socket, (current) => this.#matched(current, notice))
            .catch((error: unknown) => this.logger.warn({ err: error }, 'quick-match notice'));
        });
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
            paired = true;
            await this.#stopListening(connection);
            await this.#pair(connection, result.partnerId, code, room);
            return;
        }
      } finally {
        if (!paired) await registry.delete(code);
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
   * Paired with `partnerId` in the room `code`: the partner's gateway, wherever it is, is told
   * first, then this session enters. Whichever of the two gets there, it creates the room on its
   * pod, and a room whose second player never arrives breaks up by itself (design §9.4), so a
   * failure on either side still leaves the other an outcome and the pod deletes the room's record.
   */
  async #pair(
    connection: Connection,
    partnerId: string,
    code: string,
    room: RoomRecord,
  ): Promise<void> {
    try {
      await this.stores.matchQueue.notifyMatched({
        sessionId: partnerId,
        partnerId: sessionOf(connection).id,
        roomCode: code,
      });
    } catch (error) {
      // As if the partner's gateway went away: this session's room breaks up without them.
      this.logger.warn({ err: error, partnerId, roomCode: code }, 'quick-match notice not sent');
    }
    await this.#enter(connection, partnerId, code, room, '1v1');
  }

  /**
   * The pairing gateway paired this waiting session: into the room it created. `createRoom` goes
   * again before `attach` (the pod ignores it for a room it has), so the two gateways' links can
   * reach the pod in either order.
   */
  async #matched(connection: Connection, { roomCode, partnerId }: MatchedNotice): Promise<void> {
    if (!connection.stopWaiting) return;
    await this.#stopListening(connection);
    // The room breaks up by itself if its second player never arrives (design §9.4).
    if (connection.closed || connection.roomCode || !connection.session) return;
    const room = await this.stores.registry.get(roomCode);
    const mode = roomModeSchema.safeParse(room?.mode);
    if (!room || !mode.success) {
      // Gone before this session got there: as for a late arrival at a broken-up room.
      this.connections.send(connection, { event: 'opponentLeft', data: {} });
      return;
    }
    await this.#enter(connection, partnerId, roomCode, room, mode.data);
  }

  /** Into the quick-match room `code` paired with `partnerId`, creating it if the pod has none. */
  async #enter(
    connection: Connection,
    partnerId: string,
    code: string,
    room: RoomRecord,
    mode: RoomMode,
  ): Promise<void> {
    const sessionId = sessionOf(connection).id;
    this.logger.info({ sessionId, partnerId, roomCode: code }, 'quick-match paired');
    await this.rooms.enter(
      connection,
      code,
      room,
      createRoomMessage(code, { ...room, mode }, this.limits.maxSpectators),
    );
  }

  /** Takes the session out of the queue, if it's waiting, with the requeue cooldown. */
  async #leave(connection: Connection): Promise<void> {
    if (!connection.stopWaiting || !connection.session) return;
    await this.stores.matchQueue.cancel(connection.session.id);
    await this.#stopListening(connection);
  }

  async #stopListening(connection: Connection): Promise<void> {
    const stop = connection.stopWaiting;
    connection.stopWaiting = null;
    await stop?.();
  }
}
