import { type Action, ActionType, type PieceActionType } from '@shura/engine';
import { z } from 'zod';

/** A frame on the wire: game frames start at 1, frame 0 being the state before any step. */
export const frameSchema = z.int().min(1);

/** The action types that carry an attack's details rather than move the piece. */
const GARBAGE_ACTIONS: ReadonlySet<ActionType> = new Set([
  ActionType.GarbageReceived,
  ActionType.GarbageAccepted,
]);

const PIECE_ACTION_TYPES = Object.values(ActionType).filter(
  (type): type is PieceActionType => !GARBAGE_ACTIONS.has(type),
) as [PieceActionType, ...PieceActionType[]];

const actionUnion = z.discriminatedUnion('type', [
  z.looseObject({ frame: frameSchema, type: z.enum(PIECE_ACTION_TYPES) }),
  z.looseObject({
    frame: frameSchema,
    type: z.literal(ActionType.GarbageReceived),
    id: z.int().min(0),
    lines: z.int().min(1),
    holeSeed: z.uint32(),
  }),
  z.looseObject({
    frame: frameSchema,
    type: z.literal(ActionType.GarbageAccepted),
    id: z.int().min(0),
  }),
]);

/**
 * One engine action on the wire (design §7.1, §8.5): the engine's own `Action`, `garbageReceived`
 * included, so messages hand their actions to `step` as they are. A test checks that it has a
 * branch for every one of the engine's action types.
 */
export const actionSchema: z.ZodType<Action> = actionUnion;

// The annotation above makes every parsed action an engine action; this makes every engine action
// parse, so the two can't drift apart.
type KnownFields<T> = T extends unknown
  ? { [K in keyof T as string extends K ? never : K]: T[K] }
  : never;
const everyEngineActionParses: Action extends KnownFields<z.infer<typeof actionUnion>>
  ? true
  : false = true;
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
