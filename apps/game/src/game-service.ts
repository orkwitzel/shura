import { randomInt, randomUUID } from 'node:crypto';
import { ENGINE_VERSION } from '@shura/engine';
import {
  EMPTY_ROOM_MS,
  type GameToGateway,
  type GatewayToGame,
  gatewayToGameSchema,
  type ServerMessage,
} from '@shura/protocol';
import type { Stores } from '@shura/valkey';
import type { ServerClock } from './clock';
import type { Logger } from './logger';
import type { VerifiedGame } from './match';
import type { Peer } from './peer';
import { Room } from './room';

/** How often the pod writes its heartbeat (design §9.1): every 2 s, with a 5 s TTL. */
export const HEARTBEAT_MS = 2000;

export interface GameServiceOptions {
  readonly clock: ServerClock;
  /** The shared state: the registry and the pod's heartbeat. */
  readonly stores: Pick<Stores, 'registry' | 'podHealth'>;
  readonly podId: string;
  /** The `host:port` gateways reach this pod's internal WebSocket at (design §9.2). */
  readonly address: string;
  readonly logger: Logger;
}

/** The game service (design §9.1): rooms in memory, reached by gateways over internal links. */
export interface GameService {
  /** A gateway's internal link to this pod, carrying the rooms it forwards (ADR 0005). */
  accept(link: Peer): void;
  /** Writes the first heartbeat and keeps writing one every 2 s. */
  start(): Promise<void>;
  /** Stops the heartbeat and drops the pod's, so it gets no new rooms. */
  stop(): Promise<void>;
  /** How many rooms the pod hosts. */
  readonly roomCount: number;
  /**
   * The server's copy of each player's game in the room's current match, or its last one once
   * that has ended: what the integration tests compare clients' hashes with (design §14).
   */
  verifiedGames(roomCode: string): VerifiedGame[];
}

/** The game service, on `clock`, with its shared state in `stores`. */
export function createGameService(options: GameServiceOptions): GameService {
  return new Service(options);
}

/** A random 32-bit unsigned seed. The match is deterministic from it; choosing it needn't be. */
function freshSeed(): number {
  return randomInt(2 ** 32);
}

class Service implements GameService {
  readonly #options: GameServiceOptions;
  readonly #rooms = new Map<string, Room>();
  /** The pending deletion of each empty room. */
  readonly #deletions = new Map<string, () => void>();
  #stopHeartbeat: (() => void) | null = null;

  constructor(options: GameServiceOptions) {
    this.#options = options;
  }

  get roomCount(): number {
    return this.#rooms.size;
  }

  verifiedGames(roomCode: string): VerifiedGame[] {
    return this.#rooms.get(roomCode)?.verifiedGames() ?? [];
  }

  accept(link: Peer): void {
    const { logger } = this.#options;
    // The sessions each room has through this link, so a closed link detaches them.
    const sessions = new Map<string, Set<string>>();
    const send = (message: GameToGateway) => link.send(JSON.stringify(message));
    link.listen({
      message: (text) => {
        const message = parse(text);
        if (!message) {
          logger.warn('invalid message from a gateway');
          return;
        }
        const deliver = (sessionId: string, inner: ServerMessage) => {
          const room = this.#rooms.get(message.roomCode);
          send({
            type: 'room',
            roomCode: message.roomCode,
            epoch: room?.epoch ?? message.epoch,
            sessionId,
            message: inner,
          });
        };
        if (message.type === 'attach') {
          const known = sessions.get(message.roomCode) ?? new Set();
          sessions.set(message.roomCode, known.add(message.sessionId));
        }
        this.#receive(message, deliver);
      },
      close: () => {
        for (const [code, ids] of sessions) {
          for (const id of ids) this.#rooms.get(code)?.detach(id);
        }
      },
    });
  }

  async start(): Promise<void> {
    await this.#beat();
    this.#stopHeartbeat = this.#options.clock.every(HEARTBEAT_MS, () => {
      this.#beat().catch((error: unknown) => {
        this.#options.logger.error({ err: error }, 'heartbeat failed');
      });
    });
  }

  async stop(): Promise<void> {
    this.#stopHeartbeat?.();
    this.#stopHeartbeat = null;
    for (const room of this.#rooms.values()) room.close();
    for (const cancel of this.#deletions.values()) cancel();
    await this.#options.stores.podHealth.remove(this.#options.podId);
  }

  #beat(): Promise<void> {
    const { podId, address, stores } = this.#options;
    return stores.podHealth.beat({
      podId,
      address,
      roomCount: this.#rooms.size,
      engineVersion: ENGINE_VERSION,
      draining: false,
    });
  }

  #receive(message: GatewayToGame, deliver: (sessionId: string, message: ServerMessage) => void) {
    const room = this.#rooms.get(message.roomCode);
    switch (message.type) {
      case 'createRoom':
        if (!room) this.#create(message);
        return;
      case 'attach':
        if (!room) {
          return deliver(message.sessionId, {
            type: 'error',
            code: 'room_not_found',
            message: 'No room with that code.',
          });
        }
        this.#deletions.get(room.code)?.();
        this.#deletions.delete(room.code);
        return room.attach(message.sessionId, message.nickname, message.kind, deliver);
      case 'detach':
        return room?.detach(message.sessionId);
      case 'room':
        return room?.handle(message.sessionId, message.message);
    }
  }

  #create(message: GatewayToGame & { type: 'createRoom' }): void {
    const { roomCode: code, epoch, mode, hostId, maxSpectators } = message;
    const { clock, logger, stores } = this.#options;
    const room: Room = new Room({
      code,
      epoch,
      mode,
      ...(hostId !== undefined && { hostId }),
      ...(maxSpectators !== undefined && { maxSpectators }),
      clock,
      logger: logger.child({ roomCode: code }),
      newMatch: () => ({ matchId: randomUUID(), seed: freshSeed() }),
      changed: (update) => {
        stores.registry.update(code, update).catch((error: unknown) => {
          logger.error({ err: error, roomCode: code }, 'registry update failed');
        });
      },
      emptied: () => {
        this.#deletions.set(
          code,
          clock.after(EMPTY_ROOM_MS, () => this.#delete(room)),
        );
      },
    });
    this.#rooms.set(code, room);
    logger.info({ roomCode: code, mode }, 'room created');
  }

  #delete(room: Room): void {
    if (!room.empty || this.#rooms.get(room.code) !== room) return;
    room.close();
    this.#rooms.delete(room.code);
    this.#deletions.delete(room.code);
    this.#options.stores.registry.delete(room.code).catch((error: unknown) => {
      this.#options.logger.error({ err: error, roomCode: room.code }, 'registry delete failed');
    });
    this.#options.logger.info({ roomCode: room.code }, 'room deleted');
  }
}

function parse(text: string): GatewayToGame | undefined {
  try {
    const result = gatewayToGameSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
