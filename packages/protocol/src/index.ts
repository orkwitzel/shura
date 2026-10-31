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
  GARBAGE_ACK_TIMEOUT,
  LAG_OUT_MS,
  LIMIT_DEFAULTS,
  MAX_SPECTATORS,
  ROOM_TICK_MS,
  type RoomMode,
  SEAT_HOLD_MS,
  SEATS,
} from './constants';
export {
  NICKNAME_MAX_LENGTH,
  type NicknameProblem,
  type NicknameResult,
  suggestNickname,
  validateNickname,
} from './nickname';
export { NICKNAME_BLOCKLIST } from './nickname-blocklist';
export { parseRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, roomCodeInput } from './room-code';
