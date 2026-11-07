import { z } from 'zod';
import { clientMessages } from './client';
import { data, envelopes, noData } from './envelope';
import { countSchema, idSchema, playerKindSchema, roomModeSchema } from './fields';
import { type ServerMessage, serverMessages } from './server';

// The messages between the gateway and a game pod (design §8.7, §9.1), over the link the gateway
// keeps per room. They're `{ event, data }` too, and the rules for changing them are the client
// messages'. The room-scoped client and server messages travel on the link under their own event,
// with `{ roomCode, epoch, sessionId }` added to their `data`.

const roomCode = z.string();
/** The room's ownership epoch (design §9.3). */
const epoch = countSchema;

/** Which room, under which ownership epoch, and which session a link message concerns. */
export const linkScopeSchema = data({ roomCode, epoch, sessionId: idSchema });
export type LinkScope = z.infer<typeof linkScopeSchema>;

/** A room-scoped message's `data` with the link's scope added. */
const scoped = <Shape extends z.ZodRawShape>(message: z.ZodObject<Shape>) =>
  data({ ...message.shape, ...linkScopeSchema.shape });

/** The `data` of each message from the gateway to the game pod that owns a room, by event. */
export const gatewayToGameMessages = {
  /** Create a room on this pod (design §9.2). Quick-match rooms have no host. */
  createRoom: data({
    roomCode,
    epoch,
    mode: roomModeSchema,
    /** The session that created the room. Quick-match rooms have none. */
    hostId: idSchema.optional(),
    /** A quick-match room (design §9.4): no host, and it starts on its own. */
    quickMatch: z.literal(true).optional(),
    /** The most spectators the room holds, from the gateway's limits (design §11). */
    maxSpectators: countSchema.optional(),
  }),
  /** A session joins the room, or comes back to it, through this gateway (design §10.2). */
  attach: scoped(data({ nickname: z.string(), kind: playerKindSchema })),
  /** The session's socket closed. Leaving on purpose is the `leaveRoom` it sent. */
  detach: linkScopeSchema,
  setNickname: scoped(clientMessages.setNickname),
  leaveRoom: scoped(clientMessages.leaveRoom),
  ready: scoped(clientMessages.ready),
  startMatch: scoped(clientMessages.startMatch),
  spectate: scoped(clientMessages.spectate),
  takeSeat: scoped(clientMessages.takeSeat),
  rematch: scoped(clientMessages.rematch),
  inputBatch: scoped(clientMessages.inputBatch),
};

/** Any message from the gateway to a game pod. */
export const gatewayToGameSchema = envelopes(gatewayToGameMessages);
export type GatewayToGame = z.infer<typeof gatewayToGameSchema>;
export type GatewayToGameEvent = GatewayToGame['event'];
/** The gateway → game message of one event, such as `GatewayToGameOf<'attach'>`. */
export type GatewayToGameOf<Event extends GatewayToGameEvent> = Extract<
  GatewayToGame,
  { event: Event }
>;
/** The `data` of the gateway → game message of one event. */
export type GatewayToGameData<Event extends GatewayToGameEvent> = GatewayToGameOf<Event>['data'];

/**
 * The `data` of each message from a game pod to the gateway, by event: a message for one
 * session's client, which the gateway sends on without the scope, or `drain`.
 */
export const gameToGatewayMessages = {
  exception: scoped(serverMessages.exception),
  roomState: scoped(serverMessages.roomState),
  opponentLeft: scoped(serverMessages.opponentLeft),
  countdown: scoped(serverMessages.countdown),
  snapshot: scoped(serverMessages.snapshot),
  batchAck: scoped(serverMessages.batchAck),
  relay: scoped(serverMessages.relay),
  garbageQueued: scoped(serverMessages.garbageQueued),
  playerOut: scoped(serverMessages.playerOut),
  matchEnd: scoped(serverMessages.matchEnd),
  /**
   * The pod is shutting down (design §9.7): it finishes its running matches, takes no new rooms,
   * and closes its links once they've ended.
   */
  drain: noData(),
};

/** Any message from a game pod to the gateway. */
export const gameToGatewaySchema = envelopes(gameToGatewayMessages);
export type GameToGateway = z.infer<typeof gameToGatewaySchema>;
export type GameToGatewayEvent = GameToGateway['event'];
/** The game → gateway message of one event, such as `GameToGatewayOf<'relay'>`. */
export type GameToGatewayOf<Event extends GameToGatewayEvent> = Extract<
  GameToGateway,
  { event: Event }
>;
/** The `data` of the game → gateway message of one event. */
export type GameToGatewayData<Event extends GameToGatewayEvent> = GameToGatewayOf<Event>['data'];

/** A game → gateway message for one session's client: every one but `drain`. */
export type ClientBound = Exclude<GameToGateway, { event: 'drain' }>;

/**
 * A pod's message for one session's client, split into the link's scope and the server message
 * the client gets: the same event, its `data` without the scope (design §8.7).
 */
export function unscoped(message: ClientBound): { scope: LinkScope; message: ServerMessage } {
  const { roomCode, epoch, sessionId, ...data } = message.data;
  // Each client-bound link message is `scoped(serverMessages[event])`, so without the scope its
  // `data` is that server message's.
  return {
    scope: { roomCode, epoch, sessionId },
    message: { event: message.event, data } as ServerMessage,
  };
}
