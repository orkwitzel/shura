import { type Action, ActionType, type PieceActionType } from '@shura/engine';
import { z } from 'zod';

/** A frame on the wire: game frames start at 1, frame 0 being the state before any step. */
export const frameSchema = z.int().min(1);

/**
 * The type of the `garbageReceived` action (design §8.5, ADR 0013): the engine's own
 * `ActionType.GarbageReceived` once the engine has it, and its wire name until then.
 */
type GarbageReceivedType = [Extract<ActionType, 'garbageReceived'>] extends [never]
  ? 'garbageReceived'
  : Extract<ActionType, 'garbageReceived'>;
const GARBAGE_RECEIVED = 'garbageReceived' as GarbageReceivedType;

/** The action types that carry an attack's details rather than move the piece. */
const GARBAGE_ACTIONS: ReadonlySet<string> = new Set([
  GARBAGE_RECEIVED,
  ActionType.GarbageAccepted,
]);

const PIECE_ACTION_TYPES = Object.values(ActionType).filter(
  (type): type is PieceActionType => !GARBAGE_ACTIONS.has(type),
) as [PieceActionType, ...PieceActionType[]];

const actionUnion = z.discriminatedUnion('type', [
  z.looseObject({ frame: frameSchema, type: z.enum(PIECE_ACTION_TYPES) }),
  /** The target's client takes an attack into its garbage meter at this frame (design §8.5). */
  z.looseObject({
    frame: frameSchema,
    type: z.literal(GARBAGE_RECEIVED),
    id: z.int().min(0),
    lines: z.int().min(1),
    holeSeed: z.uint32(),
  }),
  /** A lock that clears nothing lands the attack `id` at this frame (design §8.5). */
  z.looseObject({
    frame: frameSchema,
    type: z.literal(ActionType.GarbageAccepted),
    id: z.int().min(0),
  }),
]);

/**
 * One engine action on the wire (design §7.1, §8.5): the engine's own `Action`, `garbageReceived`
 * included, so messages hand their actions to `step` as they are.
 */
export const actionSchema = actionUnion;
/** An action in an input batch or a relay. */
export type BatchAction = z.infer<typeof actionUnion>;

// Every engine action parses, and every parsed action is an engine action, so the schema and the
// engine's action types can't drift apart. (`garbageReceived` is checked against the engine once
// the engine has it.)
type KnownFields<T> = T extends unknown
  ? { [K in keyof T as string extends K ? never : K]: T[K] }
  : never;
type EngineAction = [Extract<ActionType, 'garbageReceived'>] extends [never]
  ? Action | KnownFields<Extract<BatchAction, { type: GarbageReceivedType }>>
  : Action;
const everyEngineActionParses: Action extends KnownFields<BatchAction> ? true : false = true;
const everyParsedActionIsAnEngineAction: KnownFields<BatchAction> extends EngineAction
  ? true
  : false = true;
void everyEngineActionParses;
void everyParsedActionIsAnEngineAction;

/**
 * One frame's actions in an input batch or a relay. The frame is listed even with no actions, so
 * the server sees the client's clock move (design §8.4). Each action carries the same frame.
 */
export const frameActionsSchema = z
  .looseObject({ frame: frameSchema, actions: z.array(actionSchema) })
  .refine(({ frame, actions }) => actions.every((action) => action.frame === frame), {
    message: "every action carries its entry's frame",
  });
/** One frame's actions, as an input batch or a relay lists them. */
export type FrameActions = z.infer<typeof frameActionsSchema>;
