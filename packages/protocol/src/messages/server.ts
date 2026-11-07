import type { EngineState } from '@shura/engine';
import { z } from 'zod';
import { frameActionsSchema } from './actions';
import { data, envelopes, noData } from './envelope';
import {
  countSchema,
  gameFrameSchema,
  idSchema,
  outReasonSchema,
  placeSchema,
  playerKindSchema,
  roomModeSchema,
  roomPhaseSchema,
  serverTimeSchema,
} from './fields';

/** A player with a seat, as `roomState` lists them. */
const seatedPlayer = data({
  id: idSchema,
  nickname: z.string(),
  kind: playerKindSchema,
  /** The seat's number, from 0. */
  seat: countSchema,
  ready: z.boolean(),
  /** Their place in the room's last match, if they played it. */
  lastPlace: placeSchema.optional(),
});

const spectator = data({ id: idSchema, nickname: z.string(), kind: playerKindSchema });

/** An engine's `serialize()`, which the client hands to `restoreEngine` as it is. */
const engineState = z.custom<EngineState>(
  (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  { message: 'expected an engine state' },
);

/** The `data` of each message from the gateway (and, through it, a game pod) to a client. */
export const serverMessages = {
  /** The answer to `hello`. */
  welcome: data({ sessionId: idSchema, serverTime: serverTimeSchema }),
  /**
   * An error (design §8.7): a `code` from `ERRORS` and its text. Any string, so a code added later
   * still reaches older clients, which show the text.
   */
  exception: data({ code: z.string(), message: z.string() }),
  /** The answer to `ping`, for the clock offset (design §8.4). */
  pong: data({ id: countSchema, serverTime: serverTimeSchema }),
  roomState: data({
    code: z.string(),
    mode: roomModeSchema,
    /** Quick-match rooms have no host. */
    hostId: idSchema.optional(),
    /**
     * Set on a quick-match room (design §9.4). A hosted room can be without a host for a moment
     * (everyone left), so a missing `hostId` doesn't say which kind a room is: this does.
     */
    quickMatch: z.literal(true).optional(),
    phase: roomPhaseSchema,
    players: z.array(seatedPlayer),
    spectators: z.array(spectator),
  }),
  quickMatchQueued: noData(),
  quickMatchCancelled: noData(),
  /** In a quick-match room: the other player left. */
  opponentLeft: noData(),
  countdown: data({
    /** Server time at which frame 0 falls (design §8.4). */
    startAt: serverTimeSchema,
    seed: z.uint32(),
    matchId: idSchema,
    /** Each player's index in the match, which seeds their engine. */
    players: z.array(data({ id: idSchema, index: countSchema })),
  }),
  /** Each player's game at their own last verified frame, on joining or reconnecting (§8.6). */
  snapshot: data({
    players: z.array(
      data({
        playerId: idSchema,
        frame: gameFrameSchema,
        state: engineState,
        /** The `seq` the player's next input batch must have: a new page carries on from it. */
        nextSeq: countSchema.optional(),
      }),
    ),
  }),
  /** The input batch `seq` is verified and in the match log. */
  batchAck: data({ seq: countSchema }),
  /** Another player's verified actions, combined per room tick. */
  relay: data({ playerId: idSchema, frames: z.array(frameActionsSchema) }),
  /** The server routed an attack from `from` to `to` (design §8.5). */
  garbageQueued: data({
    id: countSchema,
    from: idSchema,
    to: idSchema,
    lines: z.int().min(1),
    holeSeed: z.uint32(),
  }),
  playerOut: data({ playerId: idSchema, reason: outReasonSchema, frame: gameFrameSchema }),
  matchEnd: data({
    placements: z.array(
      data({
        playerId: idSchema,
        place: placeSchema,
        /** How and when they went out. The winner has neither. */
        reason: outReasonSchema.optional(),
        frame: gameFrameSchema.optional(),
      }),
    ),
    stats: z.array(
      data({
        playerId: idSchema,
        linesSent: countSchema,
        /** Attack per minute. */
        apm: z.number().min(0),
        /** Pieces per second. */
        pps: z.number().min(0),
      }),
    ),
  }),
};

/** Any message from the gateway to a client. */
export const serverMessageSchema = envelopes(serverMessages);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ServerEvent = ServerMessage['event'];
/** The server message of one event, such as `ServerMessageOf<'roomState'>`. */
export type ServerMessageOf<Event extends ServerEvent> = Extract<ServerMessage, { event: Event }>;
/** The `data` of the server message of one event. */
export type ServerData<Event extends ServerEvent> = ServerMessageOf<Event>['data'];
