import type { GatewayToGame, ServerMessage } from '@shura/protocol';
import type { MatchedNotice, RoomRecord, Stores } from '@shura/valkey';
import type { Logger } from './logger';
import { claimRoomCode, placeRoom } from './placement';

/** The internal message that creates a room on its pod. */
type CreateRoom = Extract<GatewayToGame, { type: 'createRoom' }>;

/** A connection, as quick-match sees it. */
export interface QuickMatchPlayer {
  sessionId(): string;
  /** In a room, or closed: a pairing that arrives now can't take them. */
  busy(): boolean;
  send(message: ServerMessage): void;
  /** Runs `task` in turn with the connection's messages, so it can't overtake one. */
  inTurn(task: () => Promise<void>): void;
  /** Enters the room `code`: `create` first (the pod ignores it if the room exists), then attach. */
  enter(code: string, room: RoomRecord, create: CreateRoom): Promise<void>;
}

export type QuickMatchStores = Pick<Stores, 'matchQueue' | 'registry' | 'podHealth'>;

/**
 * One connection's part in the 1v1 quick-match queue (design §9.4). `request` pairs the session
 * with whoever has waited longest, creating their room with no host and entering it, or queues it
 * and listens for the pairing gateway's notice. The notice comes through pub/sub even when the
 * pairing gateway is this one.
 */
export class QuickMatching {
  readonly #stores: QuickMatchStores;
  readonly #logger: Logger;
  readonly #player: QuickMatchPlayer;
  /** Stops listening for the matched notice; set while the session waits in the queue. */
  #stopListening: (() => Promise<void>) | null = null;

  constructor(stores: QuickMatchStores, logger: Logger, player: QuickMatchPlayer) {
    this.#stores = stores;
    this.#logger = logger;
    this.#player = player;
  }

  /** `quickMatch`: paired at once, or queued (`quickMatchQueued`). Asking again changes nothing. */
  async request(): Promise<void> {
    const player = this.#player;
    if (player.busy()) return player.send(error('wrong_phase', 'Leave your room first.'));
    const { matchQueue, podHealth } = this.#stores;
    // A pod is chosen before the queue is touched, so a partner is never popped with nowhere to go.
    const pod = await placeRoom(podHealth);
    if (!pod) return player.send(error('unavailable', 'No game server can take a room right now.'));
    // Listening starts before queueing, so a pairing that follows at once is heard.
    this.#stopListening ??= await matchQueue.onMatched(player.sessionId(), (notice) =>
      player.inTurn(() => this.#matched(notice)),
    );
    const result = await matchQueue.quickMatch(player.sessionId());
    switch (result.status) {
      case 'queued':
      case 'alreadyQueued':
        return player.send({ type: 'quickMatchQueued' });
      case 'coolingDown': {
        await this.#stop();
        const seconds = Math.ceil(result.retryAfterMs / 1000);
        return player.send(error('rate_limited', `Wait ${seconds} s before queueing again.`));
      }
      case 'matched':
        await this.#stop();
        return this.#pair(result.partnerId, pod.address);
    }
  }

  /** `cancelQuickMatch`: out of the queue, with the requeue cooldown (`quickMatchCancelled`). */
  async cancel(): Promise<void> {
    await this.leave();
    this.#player.send({ type: 'quickMatchCancelled' });
  }

  /** Takes the session out of the queue, if it's waiting, without telling the client. */
  async leave(): Promise<void> {
    if (!this.#stopListening) return;
    await this.#stores.matchQueue.cancel(this.#player.sessionId());
    await this.#stop();
  }

  /** Paired with `partnerId`: their room on the pod at `podAddress`, then their gateway is told. */
  async #pair(partnerId: string, podAddress: string): Promise<void> {
    const player = this.#player;
    const room: RoomRecord = { podAddress, epoch: 0, mode: '1v1', phase: 'lobby' };
    const code = await claimRoomCode(this.#stores.registry, room);
    if (code === undefined) {
      // The partner left the queue; their quick-match room never comes, and they can ask again.
      this.#logger.warn({ sessionId: player.sessionId(), partnerId }, 'no room code for a pair');
      return player.send(error('unavailable', "Couldn't find a free room code. Try again."));
    }
    this.#logger.info({ sessionId: player.sessionId(), partnerId, roomCode: code }, 'paired');
    await player.enter(code, room, create(code, room));
    await this.#stores.matchQueue.notifyMatched({
      sessionId: partnerId,
      partnerId: player.sessionId(),
      roomCode: code,
    });
  }

  /** The pairing gateway paired this waiting session: into the room it created. */
  async #matched({ roomCode, partnerId }: MatchedNotice): Promise<void> {
    if (!this.#stopListening) return;
    await this.#stop();
    const player = this.#player;
    // The room breaks up by itself if its second player never arrives (design §9.4).
    if (player.busy()) return;
    const room = await this.#stores.registry.get(roomCode);
    if (!room) return;
    this.#logger.info({ sessionId: player.sessionId(), partnerId, roomCode }, 'paired');
    await player.enter(roomCode, room, create(roomCode, room));
  }

  async #stop(): Promise<void> {
    const stop = this.#stopListening;
    this.#stopListening = null;
    await stop?.();
  }
}

function create(roomCode: string, room: RoomRecord): CreateRoom {
  return { type: 'createRoom', roomCode, epoch: room.epoch, mode: room.mode };
}

function error(code: 'wrong_phase' | 'unavailable' | 'rate_limited', message: string) {
  return { type: 'error', code, message } as const;
}
