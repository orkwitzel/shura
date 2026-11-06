/**
 * Bumped only for breaking message changes: renaming, removing or changing the meaning of a
 * message or field (docs/design.md §8.3). New optional fields and new message types don't bump it.
 */
export const PROTOCOL_VERSION = 1;

export {
  BATCH_FRAMES,
  CLOCK_BEHIND_WINDOW,
  CLOCK_LEAD_TOLERANCE,
  COUNTDOWN_MS,
  EMPTY_ROOM_MS,
  FRAMES_PER_SECOND,
  frameAt,
  GARBAGE_ACK_TIMEOUT,
  LAG_OUT_MS,
  LIMIT_DEFAULTS,
  MAX_SPECTATORS,
  ROOM_TICK_MS,
  SEAT_HOLD_MS,
  SEATS,
} from './constants';
export { ERRORS, type ErrorBody, type ErrorCode, errorBody, isErrorBody } from './errors';
export { type RoomInfo, roomInfoSchema } from './http/rooms';
export {
  type CreateSessionRequest,
  createSessionRequestSchema,
  type Session,
  sessionSchema,
} from './http/sessions';
export { ENGINE_VERSION_HEADER, PROTOCOL_VERSION_HEADER } from './http/version-headers';
export { placeAmong } from './match/places';
export {
  actionSchema,
  type BatchAction,
  type FrameActions,
  frameActionsSchema,
  frameSchema,
} from './messages/actions';
export {
  type ClientData,
  type ClientEvent,
  type ClientMessage,
  type ClientMessageOf,
  clientMessageSchema,
  clientMessages,
} from './messages/client';
export {
  type OutReason,
  outReasonSchema,
  type PlayerKind,
  playerKindSchema,
  type RoomMode,
  type RoomPhase,
  roomModeSchema,
  roomPhaseSchema,
} from './messages/fields';
export {
  type GameToGateway,
  type GameToGatewayData,
  type GameToGatewayEvent,
  type GameToGatewayOf,
  type GatewayToGame,
  type GatewayToGameData,
  type GatewayToGameEvent,
  type GatewayToGameOf,
  gameToGatewayMessages,
  gameToGatewaySchema,
  gatewayToGameMessages,
  gatewayToGameSchema,
  type LinkScope,
  linkScopeSchema,
} from './messages/internal';
export {
  type ServerData,
  type ServerEvent,
  type ServerMessage,
  type ServerMessageOf,
  serverMessageSchema,
  serverMessages,
} from './messages/server';
export {
  NICKNAME_MAX_LENGTH,
  type NicknameProblem,
  type NicknameResult,
  suggestNickname,
  validateNickname,
} from './names/nickname';
export { NICKNAME_BLOCKLIST } from './names/nickname-blocklist';
export {
  parseRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  roomCodeInput,
} from './names/room-code';
