import {
  type GameToGateway,
  type GatewayToGame,
  gameToGatewaySchema,
  type ServerMessage,
} from '@shura/protocol';
import type { Logger } from './logger';
import type { DialGame, Peer } from './peer';

/** A session's client, as a room link delivers to it. */
export interface RoomMember {
  readonly sessionId: string;
  /** A message from the room's game pod. */
  deliver(message: ServerMessage): void;
  /** The link to the room's pod closed under it: the pod is gone (design §9.7). */
  lost(roomCode: string): void;
}

/** The internal link to the game pod that owns one room, and who on this gateway is in it. */
interface Link {
  readonly peer: Peer;
  readonly epoch: number;
  readonly members: Map<string, RoomMember>;
}

/**
 * The gateway's internal links to game pods, one per room (ADR 0005, design §9.1): opened when the
 * first session on this gateway enters the room, and closed when the last one leaves it.
 */
export class RoomLinks {
  readonly #links = new Map<string, Link>();
  readonly #dial: DialGame;
  readonly #logger: Logger;

  constructor(dial: DialGame, logger: Logger) {
    this.#dial = dial;
    this.#logger = logger;
  }

  /**
   * Puts `member` in the room at `podAddress` under `epoch`, through the room's link (opened if
   * this gateway has none yet): `createRoom` first if `create` says so, then `attach`.
   */
  enter(
    roomCode: string,
    room: { podAddress: string; epoch: number },
    member: RoomMember,
    attach: { nickname: string; kind: 'guest' | 'bot' },
    create?: Extract<GatewayToGame, { type: 'createRoom' }>,
  ): void {
    const link = this.#links.get(roomCode) ?? this.#open(roomCode, room.podAddress, room.epoch);
    link.members.set(member.sessionId, member);
    if (create) this.#send(link, create);
    this.#send(link, {
      type: 'attach',
      roomCode,
      epoch: link.epoch,
      sessionId: member.sessionId,
      ...attach,
    });
  }

  /** Forwards a client's room message to the room's pod. */
  forward(roomCode: string, sessionId: string, message: GatewayToGame & { type: 'room' }): void {
    const link = this.#links.get(roomCode);
    if (link) this.#send(link, message);
    else this.#logger.warn({ roomCode, sessionId }, 'no link for a room message');
  }

  /** The room's epoch as this gateway's link has it. */
  epochOf(roomCode: string): number {
    return this.#links.get(roomCode)?.epoch ?? 0;
  }

  /**
   * Takes `sessionId` out of the room's link: after its `leaveRoom` went through, or with a
   * `detach` when its connection closed. The last member out closes the link.
   */
  exit(roomCode: string, sessionId: string, { detach }: { detach: boolean }): void {
    const link = this.#links.get(roomCode);
    if (!link) return;
    if (detach) this.#send(link, { type: 'detach', roomCode, epoch: link.epoch, sessionId });
    link.members.delete(sessionId);
    if (link.members.size === 0) {
      this.#links.delete(roomCode);
      link.peer.close();
    }
  }

  #open(roomCode: string, podAddress: string, epoch: number): Link {
    const peer = this.#dial(podAddress);
    const link: Link = { peer, epoch, members: new Map() };
    this.#links.set(roomCode, link);
    peer.listen({
      message: (text) => this.#receive(link, text),
      close: () => {
        if (this.#links.get(roomCode) !== link) return;
        this.#links.delete(roomCode);
        this.#logger.warn({ roomCode }, 'link to the game pod closed');
        for (const member of link.members.values()) member.lost(roomCode);
      },
    });
    return link;
  }

  #receive(link: Link, text: string): void {
    const message = parse(text);
    if (!message) {
      this.#logger.warn('invalid message from a game pod');
      return;
    }
    // Draining (design §9.7) changes nothing for the rooms already on the pod.
    if (message.type === 'drain') return;
    link.members.get(message.sessionId)?.deliver(message.message);
  }

  #send(link: Link, message: GatewayToGame): void {
    link.peer.send(JSON.stringify(message));
  }
}

function parse(text: string): GameToGateway | undefined {
  try {
    const result = gameToGatewaySchema.safeParse(JSON.parse(text));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
