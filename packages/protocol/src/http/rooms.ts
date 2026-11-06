import { z } from 'zod';
import { data } from '../messages/envelope';
import { countSchema, roomModeSchema } from '../messages/fields';

/**
 * `GET /api/rooms/:code`'s answer (design §8.7), or `room_not_found` (404): lets a client check a
 * room link before joining.
 */
export const roomInfoSchema = data({
  code: z.string(),
  mode: roomModeSchema,
  /** The room's seats: 2 in a 1v1 room, 8 in an FFA room. */
  seats: countSchema,
  /** The seats taken. */
  seated: countSchema,
  spectators: countSchema,
});
export type RoomInfo = z.infer<typeof roomInfoSchema>;
