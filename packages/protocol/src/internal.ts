import { z } from 'zod';
import {
  clientMessageSchema,
  playerKindSchema,
  roomModeSchema,
  serverMessageSchema,
} from './messages';

// The messages between the gateway and a game pod (design §8.7, §9.1), over the internal
// connection the gateway keeps per room. The rules for changing them are the client messages'.

/** Which room, under which ownership epoch (design §9.3), and which session a message concerns. */
const envelope = {
  roomCode: z.string(),
  epoch: z.int().min(0),
  sessionId: z.string(),
};

/** Messages from the gateway to the game pod that owns a room. */
export const gatewayToGameSchema = z.discriminatedUnion('type', [
  /** Create a room on this pod (design §9.2). Quick-match rooms have no host. */
  z.looseObject({
    type: z.literal('createRoom'),
    roomCode: envelope.roomCode,
    epoch: envelope.epoch,
    mode: roomModeSchema,
    hostId: z.string().optional(),
    /** The most spectators the room holds (the gateway's `MAX_SPECTATORS`, design §11). */
    maxSpectators: z.number().int().min(0).optional(),
  }),
  /** A session joins the room, or comes back to it, through this gateway. */
  z.looseObject({
    type: z.literal('attach'),
    ...envelope,
    nickname: z.string(),
    kind: playerKindSchema,
  }),
  /** The session's connection closed. Leaving on purpose is the `leaveRoom` it sent. */
  z.looseObject({ type: z.literal('detach'), ...envelope }),
  /** A room-scoped message from the session's client. */
  z.looseObject({ type: z.literal('room'), ...envelope, message: clientMessageSchema }),
]);
export type GatewayToGame = z.infer<typeof gatewayToGameSchema>;

/** Messages from a game pod to the gateway. */
export const gameToGatewaySchema = z.discriminatedUnion('type', [
  /** A message for the session's client. */
  z.looseObject({ type: z.literal('room'), ...envelope, message: serverMessageSchema }),
  /**
   * The pod is shutting down (design §9.7): it finishes its running matches, takes no new rooms,
   * and closes its connections once they've ended.
   */
  z.looseObject({ type: z.literal('drain') }),
]);
export type GameToGateway = z.infer<typeof gameToGatewaySchema>;
