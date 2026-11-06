import { HttpException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { ERRORS, type ErrorCode, errorBody } from '@shura/protocol';

/** A socket refusal: `exception{ code, message }` to the client that asked. */
const refusal = (code: ErrorCode, message?: string) => () =>
  new WsException(errorBody(code, message));

/** Why the gateway refuses a room message (design §8.7, §10.1, §11). */
export const REFUSE = {
  /** A session is in one room at a time, so it hosts at most one (design §11). */
  inARoom: refusal('wrong_phase', 'Leave your room first.'),
  notInRoom: refusal('not_in_room'),
  /** In the words of `ERRORS`, as the game service says it too. */
  noRoom: refusal('room_not_found'),
  noPod: refusal('unavailable', 'No game server is available. Try again soon.'),
  noRoomCode: refusal('unavailable', 'No room code is free. Try again.'),
} as const;

/**
 * A session's room went away under it (design §10.2): gone by the time it came back, or its pod's
 * link closed. Sent, not thrown: nothing the client asked for is refused.
 */
export const ROOM_GONE = errorBody('room_not_found', 'Your room is gone.');

/** `GET /api/rooms/:code` for a room that doesn't exist. */
export const roomNotFound = (): HttpException =>
  new HttpException(errorBody('room_not_found'), ERRORS.room_not_found.status);
