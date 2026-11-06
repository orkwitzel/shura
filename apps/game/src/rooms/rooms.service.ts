import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import {
  EMPTY_ROOM_MS,
  type GameToGateway,
  type LinkScope,
  MAX_SPECTATORS,
  type ServerMessage,
} from '@shura/protocol';
import type { Stores } from '@shura/valkey';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { WebSocket } from 'ws';
import { CLOCK, type Clock } from '../clock';
import { NEW_MATCH, type NewMatch, type VerifiedGame } from '../match';
import { STORES } from '../valkey';
import { REFUSALS } from './refusals';
import { type Deliver, exception, Room } from './room';
import type {
  AttachDto,
  CreateRoomDto,
  DetachDto,
  InputBatchDto,
  LeaveRoomDto,
  ReadyDto,
  RematchDto,
  SetNicknameDto,
  SpectateDto,
  StartMatchDto,
  TakeSeatDto,
} from './rooms.dto';

/**
 * A gateway's link, as the room it carries knows it (ADR 0005): bound to the room of its first
 * message, with one `deliver` for it, and the sessions it attached, so that closing the link
 * detaches them.
 */
interface Binding {
  readonly code: string;
  readonly deliver: Deliver;
  readonly sessions: Set<string>;
}

/**
 * The rooms this pod hosts (design §9.1, §10.1), reached by gateways over one link per room. Each
 * link message names its room and session; the rooms answer each session through the link it
 * came by, with the scope added (design §8.7). A room refusing a player's action answers that
 * player with a routed `exception`, never with an error on the link.
 */
@Injectable()
export class RoomsService implements OnApplicationShutdown {
  readonly #rooms = new Map<string, Room>();
  /** The pending deletion of each empty room. */
  readonly #deletions = new Map<string, () => void>();
  readonly #links = new WeakMap<WebSocket, Binding>();

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(STORES) private readonly stores: Stores,
    @Inject(NEW_MATCH) private readonly newMatch: NewMatch,
    @InjectPinoLogger(RoomsService.name) private readonly logger: PinoLogger,
  ) {}

  /** How many rooms the pod hosts, for its heartbeat (design §9.2). */
  get roomCount(): number {
    return this.#rooms.size;
  }

  /**
   * The server's copy of each player's game in the room's current match, or its last one once
   * that has ended (design §14): what clients' engine hashes are checked against.
   */
  verifiedGames(code: string): VerifiedGame[] {
    return this.#rooms.get(code)?.verifiedGames() ?? [];
  }

  /** A new room on this pod (design §9.2). One that already exists is left as it is. */
  createRoom(link: WebSocket, message: CreateRoomDto): void {
    if (!this.#bind(link, message)) return;
    const { roomCode: code, epoch, mode, hostId, quickMatch, maxSpectators } = message;
    if (this.#rooms.has(code)) return;
    const room: Room = new Room({
      code,
      epoch,
      mode,
      kind: quickMatch ? 'quick' : 'hosted',
      ...(hostId !== undefined && { hostId }),
      maxSpectators: maxSpectators ?? MAX_SPECTATORS,
      clock: this.clock,
      logger: this.logger.logger.child({ roomCode: code }),
      newMatch: this.newMatch,
      changed: ({ hostId, ...summary }) => {
        this.stores.registry.update(code, { ...summary, hostId }).catch((error: unknown) => {
          this.logger.error({ err: error, roomCode: code }, 'registry update failed');
        });
      },
      emptied: () => {
        this.#deletions.get(code)?.();
        this.#deletions.set(
          code,
          this.clock.after(EMPTY_ROOM_MS, () => this.#delete(room)),
        );
      },
    });
    this.#rooms.set(code, room);
    this.logger.info({ roomCode: code, mode }, 'room created');
  }

  /** A session joins its room through this link, or comes back to it (design §10.2). */
  attach(link: WebSocket, message: AttachDto): void {
    const binding = this.#bind(link, message);
    if (!binding) return;
    const room = this.#rooms.get(message.roomCode);
    if (!room) {
      binding.deliver(message.sessionId, exception(REFUSALS.noRoom));
      return;
    }
    this.#deletions.get(room.code)?.();
    this.#deletions.delete(room.code);
    binding.sessions.add(message.sessionId);
    room.attach(message.sessionId, message.nickname, message.kind, binding.deliver);
  }

  /** The session's socket closed on its gateway: the room holds its place (design §10.2). */
  detach(link: WebSocket, message: DetachDto): void {
    const binding = this.#bind(link, message);
    if (!binding) return;
    binding.sessions.delete(message.sessionId);
    this.#rooms.get(message.roomCode)?.detach(message.sessionId, binding.deliver);
  }

  leaveRoom(link: WebSocket, message: LeaveRoomDto): void {
    this.#bind(link, message)?.sessions.delete(message.sessionId);
    this.#room(link, message)?.leave(message.sessionId);
  }

  setNickname(link: WebSocket, message: SetNicknameDto): void {
    this.#room(link, message)?.setNickname(message.sessionId, message);
  }

  spectate(link: WebSocket, message: SpectateDto): void {
    this.#room(link, message)?.spectate(message.sessionId);
  }

  takeSeat(link: WebSocket, message: TakeSeatDto): void {
    this.#room(link, message)?.takeSeat(message.sessionId);
  }

  ready(link: WebSocket, message: ReadyDto): void {
    this.#room(link, message)?.ready(message.sessionId, message);
  }

  startMatch(link: WebSocket, message: StartMatchDto): void {
    this.#room(link, message)?.start(message.sessionId);
  }

  /** After results in a quick-match room: the next match once both players ask (design §9.4). */
  rematch(link: WebSocket, message: RematchDto): void {
    this.#room(link, message)?.rematch(message.sessionId);
  }

  inputBatch(link: WebSocket, message: InputBatchDto): void {
    this.#room(link, message)?.inputBatch(message.sessionId, message);
  }

  /** A gateway's link closed: every session it attached is detached. */
  linkClosed(link: WebSocket): void {
    const binding = this.#links.get(link);
    if (!binding) return;
    this.#links.delete(link);
    const room = this.#rooms.get(binding.code);
    for (const sessionId of binding.sessions) room?.detach(sessionId, binding.deliver);
  }

  onApplicationShutdown(): void {
    for (const room of this.#rooms.values()) room.close();
    for (const cancel of this.#deletions.values()) cancel();
  }

  /** The room a message on `link` is for, if the link carries it and the pod hosts it. */
  #room(link: WebSocket, scope: Pick<LinkScope, 'roomCode' | 'epoch'>): Room | undefined {
    return this.#bind(link, scope) && this.#rooms.get(scope.roomCode);
  }

  /**
   * The link's binding to the room of its first message. A message for another room on it is
   * dropped (`undefined`).
   */
  #bind(link: WebSocket, { roomCode, epoch }: Pick<LinkScope, 'roomCode' | 'epoch'>) {
    let binding = this.#links.get(link);
    if (!binding) {
      binding = {
        code: roomCode,
        deliver: this.#deliverer(link, roomCode, epoch),
        sessions: new Set(),
      };
      this.#links.set(link, binding);
    }
    if (binding.code !== roomCode) {
      this.logger.warn({ roomCode }, "a message for another room on a room's link");
      return undefined;
    }
    return binding;
  }

  /** Sends a room's message for one session down `link`, with the link's scope added (§8.7). */
  #deliverer(link: WebSocket, roomCode: string, epoch: number): Deliver {
    return (sessionId, message: ServerMessage) => {
      if (link.readyState !== WebSocket.OPEN) return;
      const scope = { roomCode, epoch: this.#rooms.get(roomCode)?.epoch ?? epoch, sessionId };
      const routed = { event: message.event, data: { ...message.data, ...scope } } as GameToGateway;
      link.send(JSON.stringify(routed));
    };
  }

  #delete(room: Room): void {
    if (!room.empty || this.#rooms.get(room.code) !== room) return;
    room.close();
    this.#rooms.delete(room.code);
    this.#deletions.delete(room.code);
    this.stores.registry.delete(room.code).catch((error: unknown) => {
      this.logger.error({ err: error, roomCode: room.code }, 'registry delete failed');
    });
    this.logger.info({ roomCode: room.code }, 'room deleted');
  }
}
