import type { EngineState } from '@shura/engine';
import { z } from 'zod';
import { frameActionsSchema } from './actions';

// The messages between a client and the gateway (design §8.7). Every message is a JSON object
// whose `type` names it. Unknown fields pass through, so adding optional fields stays backward
// compatible (§8.2); renaming, removing or changing the meaning of a message or field is a breaking
// change that bumps `PROTOCOL_VERSION` (§8.3).

const id = z.string();
const count = z.int().min(0);
/** A place in a match: 1 is the winner, and players out at the same frame share one. */
const place = z.int().min(1);
/** A game frame, or 0 for a player who went out before their first. */
const gameFrame = z.int().min(0);
/** Server time: ms since the Unix epoch, on the server's clock. */
const serverTime = z.number();

/** A room's mode, fixed when it's created (design §10.1). */
export const roomModeSchema = z.enum(['1v1', 'ffa']);
export type RoomMode = z.infer<typeof roomModeSchema>;

/** Who a player is (design §10.2): every person is a `guest` in v1, and the bot tool says `bot`. */
export const playerKindSchema = z.enum(['guest', 'bot']);
export type PlayerKind = z.infer<typeof playerKindSchema>;

/** A room's phase (design §10.1). */
export const roomPhaseSchema = z.enum(['lobby', 'countdown', 'playing', 'results']);
export type RoomPhase = z.infer<typeof roomPhaseSchema>;

/** How a player went out of a match (design §10.1). */
export const outReasonSchema = z.enum(['toppedOut', 'laggedOut', 'removed', 'left']);
export type OutReason = z.infer<typeof outReasonSchema>;

/** The `error` codes (design §8.7, §11). Clients show each in plain words. */
export const ERROR_CODES = [
  /** `protocolVersion` or `engineVersion` differs from the server's: update the client. */
  'version_mismatch',
  /** A message that isn't valid JSON or fails its schema. */
  'invalid_message',
  'room_not_found',
  /** The room's spectator list is full (`MAX_SPECTATORS`). Joining a full set of seats spectates. */
  'room_full',
  'nickname_invalid',
  'rate_limited',
  'too_many_connections',
  /** Too many rooms created, or this session already hosts one. */
  'room_limit',
  /** A host-only action from someone who isn't the host. */
  'not_host',
  /** A room action from a session that isn't in a room. */
  'not_in_room',
  /** An action the room's phase doesn't allow, such as `takeSeat` during a match. */
  'wrong_phase',
  /** `takeSeat` when every seat is taken. */
  'no_free_seat',
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

const message = <Type extends string, Shape extends z.ZodRawShape>(type: Type, shape: Shape) =>
  z.looseObject({ type: z.literal(type), ...shape });

/** Messages from a client to the gateway. */
export const clientMessageSchema = z.discriminatedUnion('type', [
  /** The first message on a connection (design §8.3). */
  message('hello', {
    protocolVersion: z.int(),
    engineVersion: z.int(),
    clientVersion: z.string(),
    /** As the player typed it; the server normalizes it (`validateNickname`). */
    nickname: z.string(),
    /** To reclaim a session, its seat and its nickname after reconnecting (design §10.2). */
    sessionToken: z.string().optional(),
    kind: playerKindSchema.optional(),
  }),
  /** In the lobby only. */
  message('setNickname', { nickname: z.string() }),
  message('ping', { id: count }),
  message('createRoom', { mode: roomModeSchema }),
  /** The code as typed; the server parses it (`parseRoomCode`). */
  message('joinRoom', { code: z.string() }),
  message('leaveRoom', {}),
  message('ready', { ready: z.boolean() }),
  /** Host only: the host's own ready. */
  message('startMatch', {}),
  /** Step out of a seat, in the lobby. */
  message('spectate', {}),
  /** Take a free seat, in the lobby. */
  message('takeSeat', {}),
  message('quickMatch', {}),
  message('cancelQuickMatch', {}),
  /** Quick-match rooms, after results. */
  message('rematch', {}),
  /** The client's actions over a few frames, numbered by `seq` from 0 (design §8.1). */
  message('inputBatch', { seq: count, frames: z.array(frameActionsSchema) }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage['type'];
/** The client message of one type, such as `ClientMessageOf<'hello'>`. */
export type ClientMessageOf<Type extends ClientMessageType> = Extract<
  ClientMessage,
  { type: Type }
>;

/** A player with a seat, as `roomState` lists them. */
const seatedPlayer = z.looseObject({
  id,
  nickname: z.string(),
  kind: playerKindSchema,
  /** The seat's number, from 0. */
  seat: count,
  ready: z.boolean(),
  /** Their place in the room's last match, if they played it. */
  lastPlace: place.optional(),
});

const spectator = z.looseObject({ id, nickname: z.string(), kind: playerKindSchema });

const engineState = z.custom<EngineState>(
  (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  { message: 'expected an engine state' },
);

/** Messages from the gateway (and, through it, the game service) to a client. */
export const serverMessageSchema = z.discriminatedUnion('type', [
  /** The answer to `hello`, with the nickname as the server normalized it. */
  message('welcome', { sessionId: id, sessionToken: z.string(), nickname: z.string(), serverTime }),
  message('error', { code: errorCodeSchema, message: z.string() }),
  /** The answer to `ping`, for the clock offset (design §8.4). */
  message('pong', { id: count, serverTime }),
  message('roomState', {
    code: z.string(),
    mode: roomModeSchema,
    /** Quick-match rooms have no host. */
    hostId: id.optional(),
    phase: roomPhaseSchema,
    players: z.array(seatedPlayer),
    spectators: z.array(spectator),
  }),
  message('quickMatchQueued', {}),
  message('quickMatchCancelled', {}),
  /** In a quick-match room: the other player left. */
  message('opponentLeft', {}),
  message('countdown', {
    /** Server time at which frame 0 falls (design §8.4). */
    startAt: serverTime,
    seed: z.uint32(),
    matchId: id,
    /** Each player's index in the match, which seeds their engine. */
    players: z.array(z.looseObject({ id, index: count })),
  }),
  /** Each player's game at their own last verified frame, on joining or reconnecting (§8.6). */
  message('snapshot', {
    players: z.array(z.looseObject({ playerId: id, frame: gameFrame, state: engineState })),
  }),
  /** The input batch `seq` is verified and in the match log. */
  message('batchAck', { seq: count }),
  /** Another player's verified actions. */
  message('relay', { playerId: id, frames: z.array(frameActionsSchema) }),
  /** The server routed an attack from `from` to `to` (design §8.5). */
  message('garbageQueued', {
    id: count,
    from: id,
    to: id,
    lines: z.int().min(1),
    holeSeed: z.uint32(),
  }),
  message('playerOut', { playerId: id, reason: outReasonSchema, frame: gameFrame }),
  message('matchEnd', {
    placements: z.array(
      z.looseObject({
        playerId: id,
        place,
        /** How and when they went out. The winner has neither. */
        reason: outReasonSchema.optional(),
        frame: gameFrame.optional(),
      }),
    ),
    stats: z.array(
      z.looseObject({
        playerId: id,
        linesSent: count,
        /** Attack per minute. */
        apm: z.number().min(0),
        /** Pieces per second. */
        pps: z.number().min(0),
      }),
    ),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ServerMessageType = ServerMessage['type'];
/** The server message of one type, such as `ServerMessageOf<'roomState'>`. */
export type ServerMessageOf<Type extends ServerMessageType> = Extract<
  ServerMessage,
  { type: Type }
>;
