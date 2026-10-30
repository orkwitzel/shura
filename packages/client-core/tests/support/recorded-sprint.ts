import { ActionType, type PieceAction, type PieceActionType } from '@shura/engine';
// The engine's recorded Sprint (design §5.3): a full game whose action log finishes 40 lines. Read
// from the engine package so it stays in step when the engine re-records it.
import recorded from '../../../engine/recorded-matches/sprint.json';

const PIECE_ACTION_TYPES = new Set<string>(
  Object.values(ActionType).filter((type) => type !== ActionType.GarbageAccepted),
);

function isPieceActionType(type: string): type is PieceActionType {
  return PIECE_ACTION_TYPES.has(type);
}

/** The recorded Sprint's seed. */
export const SPRINT_SEED: number = recorded.seed;

/** The recorded Sprint's action log, which finishes the game. */
export const SPRINT_ACTIONS: readonly PieceAction[] = (recorded.players[0]?.actions ?? []).map(
  ({ frame, type }) => {
    if (!isPieceActionType(type)) throw new Error(`not a piece action: ${type}`);
    return { frame, type };
  },
);

/** The frame the recorded Sprint finishes on (its description says so). */
export const SPRINT_FINISH_FRAME = 1_222;
