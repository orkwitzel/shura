import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  type GatewayToGame,
  type GatewayToGameData,
  gameToGatewaySchema,
  type PlayerKind,
  type ServerMessage,
  unscoped,
} from '@shura/protocol';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { WebSocket } from 'ws';

/** A session's client, as a room link delivers to it. */
export interface RoomMember {
  readonly sessionId: string;
  /** A message from the room's game pod for this session, without the link's scope. */
  deliver(message: ServerMessage): void;
  /** The link to the room's pod closed under it: the pod is gone (design §9.7). */
  lost(roomCode: string): void;
}

/** Where a room lives: its game pod and ownership epoch (design §9.2, §9.3). */
export interface RoomPlace {
  readonly podAddress: string;
  readonly epoch: number;
}

/** The internal link to the game pod that owns one room, and who on this gateway is in it. */
interface Link {
  readonly socket: WebSocket;
  readonly epoch: number;
  readonly members: Map<string, RoomMember>;
  /** Messages sent before the socket opened, sent in order once it does. */
  outbox: string[];
}

/** A room-scoped message for the link: its event and its `data` without the scope. */
type Forwarded = {
  [Event in GatewayToGame['event']]: {
    event: Event;
    data: Omit<GatewayToGameData<Event>, 'roomCode' | 'epoch' | 'sessionId'>;
  };
}[GatewayToGame['event']];

/**
 * The gateway's internal links to game pods, one per room (ADR 0005, design §9.1): a plain `ws`
 * client to `ws://<pod>/room-links`, opened when the first session on this gateway enters the room
 * and closed when the last one leaves it. Every message on it is `{ event, data }` with the room's
 * scope in `data` (§8.7). What the pod sends is checked with the protocol's schemas and handed to
 * the session it names, without the scope.
 */
@Injectable()
export class RoomLinksService implements OnModuleDestroy {
  readonly #links = new Map<string, Link>();

  constructor(@InjectPinoLogger(RoomLinksService.name) private readonly logger: PinoLogger) {}

  /**
   * Puts `member` in the room `roomCode` at `place`, through the room's link (opened if this
   * gateway has none yet): `createRoom` first if `create` says so, then `attach`.
   */
  enter(
    roomCode: string,
    place: RoomPlace,
    member: RoomMember,
    attach: { readonly nickname: string; readonly kind: PlayerKind },
    create?: GatewayToGameData<'createRoom'>,
  ): void {
    const link = this.#links.get(roomCode) ?? this.#open(roomCode, place);
    link.members.set(member.sessionId, member);
    if (create) this.#send(link, { event: 'createRoom', data: create });
    this.#send(link, {
      event: 'attach',
      data: { roomCode, epoch: link.epoch, sessionId: member.sessionId, ...attach },
    });
  }

  /** Forwards a session's room message to the room's pod, under the link's scope. */
  forward(roomCode: string, sessionId: string, { event, data }: Forwarded): void {
    const link = this.#links.get(roomCode);
    if (!link) {
      this.logger.warn({ roomCode, sessionId }, 'no link for a room message');
      return;
    }
    this.#send(link, {
      event,
      data: { ...data, roomCode, epoch: link.epoch, sessionId },
    } as GatewayToGame);
  }

  /**
   * Takes `member` out of the room's link: after its `leaveRoom` went through, or with a `detach`
   * when its connection closed. The last member out closes the link. A member that has already
   * been replaced (the session came back on a newer connection) changes nothing.
   */
  exit(roomCode: string, member: RoomMember, { detach }: { readonly detach: boolean }): void {
    const link = this.#links.get(roomCode);
    const { sessionId } = member;
    if (!link || link.members.get(sessionId) !== member) return;
    if (detach) {
      this.#send(link, { event: 'detach', data: { roomCode, epoch: link.epoch, sessionId } });
    }
    link.members.delete(sessionId);
    if (link.members.size === 0) {
      this.#links.delete(roomCode);
      this.#close(link);
    }
  }

  onModuleDestroy(): void {
    for (const link of this.#links.values()) link.socket.terminate();
    this.#links.clear();
  }

  #open(roomCode: string, { podAddress, epoch }: RoomPlace): Link {
    const socket = new WebSocket(`ws://${podAddress}/room-links`, { perMessageDeflate: false });
    const link: Link = { socket, epoch, members: new Map(), outbox: [] };
    this.#links.set(roomCode, link);
    socket.on('open', () => {
      for (const text of link.outbox) socket.send(text);
      link.outbox = [];
    });
    socket.on('message', (data) => this.#receive(link, String(data)));
    socket.on('error', (error) => this.logger.warn({ err: error, roomCode }, 'room link error'));
    socket.on('close', () => {
      if (this.#links.get(roomCode) !== link) return;
      this.#links.delete(roomCode);
      this.logger.warn({ roomCode }, 'link to the game pod closed');
      for (const member of link.members.values()) member.lost(roomCode);
    });
    return link;
  }

  #receive(link: Link, text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    const message = gameToGatewaySchema.safeParse(parsed);
    if (!message.success) {
      this.logger.warn({ text: text.slice(0, 200) }, 'invalid message from a game pod');
      return;
    }
    // Draining (design §9.7) changes nothing for the rooms already on the pod.
    if (message.data.event === 'drain') return;
    const { scope, message: forClient } = unscoped(message.data);
    link.members.get(scope.sessionId)?.deliver(forClient);
  }

  #send(link: Link, message: GatewayToGame): void {
    const text = JSON.stringify(message);
    if (link.socket.readyState === WebSocket.CONNECTING) link.outbox.push(text);
    else if (link.socket.readyState === WebSocket.OPEN) link.socket.send(text);
  }

  #close(link: Link): void {
    if (link.socket.readyState === WebSocket.CONNECTING) {
      // Closing before it opens fails the handshake; let what's queued go first.
      link.socket.once('open', () => link.socket.close());
    } else {
      link.socket.close();
    }
  }
}
