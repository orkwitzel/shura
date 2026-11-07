import type { ModeSettings } from '@shura/engine';
import { frameActionsSchema } from '@shura/protocol';
import { z } from 'zod';

// The match log's entries (design §9.6, ADR 0007): what the game service writes to `log:{matchId}`
// and a replay or phase-2 recovery reads back. `MatchLog` keeps them as JSON without knowing their
// shape, so the game service owns these schemas. They aren't messages, but they follow the same
// rules: add optional fields freely.

const id = z.string();
const count = z.int().min(0);

const modeSettings = z.custom<ModeSettings>(
  (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  { message: 'expected mode settings' },
);

/** A log's first entry, written at match start: the seed, the mode settings and the players. */
export const matchLogStartSchema = z.looseObject({
  seed: z.uint32(),
  settings: modeSettings,
  /** In their engine order: each player's `index` seeds their engine. */
  players: z.array(z.looseObject({ id, index: count })),
});
export type MatchLogStart = z.infer<typeof matchLogStartSchema>;

/** A verified input batch, as the log keeps it: only the frames the server verified. */
export const loggedBatchSchema = z.looseObject({
  playerId: id,
  seq: count,
  frames: z.array(frameActionsSchema),
});
export type LoggedBatch = z.infer<typeof loggedBatchSchema>;

/** A garbage routing: one `garbageQueued`, and the target's verified frame when it was sent. */
export const loggedRoutingSchema = z.looseObject({
  from: id,
  to: id,
  id: count,
  lines: z.int().min(1),
  holeSeed: z.uint32(),
  /** The target's verified frame when it was sent, which its timeout counts from. */
  frame: count,
});
export type LoggedRouting = z.infer<typeof loggedRoutingSchema>;

/**
 * One append: a room's newly verified batches and garbage routings since the last one. The epoch
 * that tags it is kept beside it by `MatchLog`, not in it.
 */
export const matchLogEntrySchema = z.looseObject({
  batches: z.array(loggedBatchSchema),
  routings: z.array(loggedRoutingSchema),
});
export type MatchLogEntry = z.infer<typeof matchLogEntrySchema>;
