import { type Action, ActionType, type PieceAction } from '@shura/engine';
// The engine's recorded 1v1 (design §5.3): two greedy bots whose clears send garbage both ways.
// Read from the engine package so it stays in step when the engine re-records it.
import recorded from '../../../../packages/engine/recorded-matches/versus-1v1.json';

const GARBAGE_TYPES = new Set<string>([ActionType.GarbageReceived, ActionType.GarbageAccepted]);

/** The recorded 1v1's match seed. */
export const RECORDED_SEED: number = recorded.seed;

/** Each player's own actions, without the garbage ones, by player index. */
export const RECORDED_PIECE_ACTIONS: readonly (readonly PieceAction[])[] = recorded.players.map(
  ({ actions }) =>
    (actions as Action[]).filter(
      (action): action is PieceAction => !GARBAGE_TYPES.has(action.type),
    ),
);
