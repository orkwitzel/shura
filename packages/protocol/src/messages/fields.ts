import { z } from 'zod';

// Field schemas that several messages share (docs/design.md §8.7).

/** A player's or a session's id. */
export const idSchema = z.string();

/** A count, a sequence number or a seat: a whole number from 0. */
export const countSchema = z.int().min(0);

/** A place in a match: 1 is the winner, and players out at the same frame share one. */
export const placeSchema = z.int().min(1);

/** A game frame, or 0 for a player who went out before their first. */
export const gameFrameSchema = z.int().min(0);

/** Server time: ms since the Unix epoch, on the server's clock. */
export const serverTimeSchema = z.number();

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
