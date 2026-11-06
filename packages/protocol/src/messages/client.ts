import { z } from 'zod';
import { frameActionsSchema } from './actions';
import { data, envelopes, noData } from './envelope';
import { countSchema, playerKindSchema, roomModeSchema } from './fields';

/** The `data` of each message from a client to the gateway (design §8.7), by event. */
export const clientMessages = {
  /**
   * The first message on a socket (design §8.3). Every other message except `ping` is refused
   * with `session_required` until it succeeds.
   */
  hello: data({
    protocolVersion: z.int(),
    engineVersion: z.int(),
    clientVersion: z.string(),
    /** From `POST /api/sessions` (design §10.2). */
    sessionToken: z.string(),
    /** `bot` from the bot tool (design §13.4); people leave it out. */
    kind: playerKindSchema.optional(),
  }),
  /** In the lobby only. As the player typed it; the server normalizes it (`validateNickname`). */
  setNickname: data({ nickname: z.string() }),
  /** For the clock offset (design §8.4); answered with `pong` with the same `id`. */
  ping: data({ id: countSchema }),
  /** A new room, with its mode fixed for the room's life (design §10.1). */
  createRoom: data({ mode: roomModeSchema }),
  /** The code as typed; the server parses it (`parseRoomCode`). */
  joinRoom: data({ code: z.string() }),
  leaveRoom: noData(),
  ready: data({ ready: z.boolean() }),
  /** Host only: the host's own ready. */
  startMatch: noData(),
  /** Step out of a seat, in the lobby. */
  spectate: noData(),
  /** Take a free seat, in the lobby. */
  takeSeat: noData(),
  quickMatch: noData(),
  cancelQuickMatch: noData(),
  /** Quick-match rooms, after results. */
  rematch: noData(),
  /** The client's actions over a few frames, numbered by `seq` from 0 (design §8.1). */
  inputBatch: data({ seq: countSchema, frames: z.array(frameActionsSchema) }),
};

/** Any message from a client to the gateway. */
export const clientMessageSchema = envelopes(clientMessages);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientEvent = ClientMessage['event'];
/** The client message of one event, such as `ClientMessageOf<'hello'>`. */
export type ClientMessageOf<Event extends ClientEvent> = Extract<ClientMessage, { event: Event }>;
/** The `data` of the client message of one event. */
export type ClientData<Event extends ClientEvent> = ClientMessageOf<Event>['data'];
