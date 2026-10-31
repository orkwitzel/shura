import { type Action, ActionType, type PieceAction } from '@shura/engine';
// The engine's recorded 1v1 (design §5.3): two greedy bots in lockstep, with the engine's test
// harness in the server's part, sending each attack on as `garbageReceived` at the next frame.
// Read from the engine package so it stays in step when the engine re-records it.
import recorded from '../../../../packages/engine/recorded-matches/versus-1v1.json';

const GARBAGE_TYPES = new Set<string>([ActionType.GarbageReceived, ActionType.GarbageAccepted]);

/** The recorded 1v1's match seed. */
export const RECORDED_SEED: number = recorded.seed;

/** The frame the recorded 1v1 ends on: player 0 tops out there. */
export const RECORDED_LAST_FRAME: number = recorded.lastFrame;

/** Each player's whole action log, garbage actions included, by player index. */
export const RECORDED_ACTIONS: readonly (readonly Action[])[] = recorded.players.map(
  ({ actions }) => actions as Action[],
);

/** Each player's own actions, without the garbage ones, by player index. */
export const RECORDED_PIECE_ACTIONS: readonly (readonly PieceAction[])[] = RECORDED_ACTIONS.map(
  (actions) => actions.filter((action): action is PieceAction => !GARBAGE_TYPES.has(action.type)),
);

/** The hash each player's game ends on, by player index. */
export const RECORDED_HASHES: readonly string[] = recorded.players.map(
  ({ expectedHash }) => expectedHash,
);
