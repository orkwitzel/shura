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
  noRoom: refusal('room_not_found', 'No room with that code.'),
  noPod: refusal('unavailable', 'No game server is available. Try again soon.'),
  noRoomCode: refusal('unavailable', 'No room code is free. Try again.'),
} as const;

/** `GET /api/rooms/:code` for a room that doesn't exist. */
export const roomNotFound = (): HttpException =>
  new HttpException(errorBody('room_not_found'), ERRORS.room_not_found.status);
