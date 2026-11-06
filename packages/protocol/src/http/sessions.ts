import { z } from 'zod';
import { data } from '../messages/envelope';
import { idSchema } from '../messages/fields';

/**
 * `POST /api/sessions`'s body (design §8.7, §10.2): a client's first contact. With a still-valid
 * `sessionToken` it resumes that session; otherwise it starts a new one.
 */
export const createSessionRequestSchema = data({
  /** As the player typed it; the server normalizes it (`validateNickname`). */
  nickname: z.string(),
  sessionToken: z.string().optional(),
});
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

/** `POST /api/sessions`'s answer, with the nickname as the server normalized it. */
export const sessionSchema = data({
  sessionId: idSchema,
  /** Sent in `hello`, and in `POST /api/sessions` to resume the session after a reconnect. */
  sessionToken: z.string(),
  nickname: z.string(),
});
export type Session = z.infer<typeof sessionSchema>;
