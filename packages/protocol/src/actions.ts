import { type Action, ActionType, type PieceActionType } from '@shura/engine';
import { z } from 'zod';

/** A frame on the wire: game frames start at 1, frame 0 being the state before any step. */
export const frameSchema = z.int().min(1);

/** The name of the received-garbage action on the wire (design §8.5, ADR 0013). */
const GARBAGE_RECEIVED = 'garbageReceived';

/** The action types that aren't piece actions: they carry an attack's details. */
const GARBAGE_ACTIONS: ReadonlySet<string> = new Set([
  ActionType.GarbageAccepted,
  GARBAGE_RECEIVED,
]);

const PIECE_ACTION_TYPES = Object.values(ActionType).filter(
  (type): type is PieceActionType => !GARBAGE_ACTIONS.has(type),
) as [PieceActionType, ...PieceActionType[]];

const actionUnion = z.discriminatedUnion('type', [
  z.looseObject({ frame: frameSchema, type: z.enum(PIECE_ACTION_TYPES) }),
  z.looseObject({
    frame: frameSchema,
    type: z.literal(ActionType.GarbageAccepted),
    id: z.int().min(0),
  }),
  z.looseObject({
    frame: frameSchema,
    type: z.literal(GARBAGE_RECEIVED),
    id: z.int().min(0),
    lines: z.int().min(1),
    holeSeed: z.uint32(),
  }),
]);

/**
 * One engine action on the wire (design §7.1, §8.5): the engine's own `Action`, `garbageReceived`
 * included. It's typed as the engine's `Action`, so messages hand their actions to `step` as they
 * are; a test checks that it has a branch for every one of the engine's action types.
 */
export const actionSchema = actionUnion as unknown as z.ZodType<Action>;

// Every engine action must parse, so the union can only be wider than `Action`, never narrower.
type KnownFields<T> = T extends unknown
  ? { [K in keyof T as string extends K ? never : K]: T[K] }
  : never;
type Parsed = KnownFields<z.infer<typeof actionUnion>>;
const everyEngineActionParses: Action extends Parsed ? true : false = true;
void everyEngineActionParses;

/**
 * One frame's actions in an input batch or a relay. The frame is listed even with no actions, so
 * the server sees the client's clock move (design §8.4). Each action carries the same frame.
 */
export const frameActionsSchema = z
  .looseObject({ frame: frameSchema, actions: z.array(actionSchema) })
  .refine(({ frame, actions }) => actions.every((action) => action.frame === frame), {
    message: "every action carries its entry's frame",
  });
