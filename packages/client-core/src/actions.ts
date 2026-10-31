import { ActionType, type PieceActionType } from '@shura/engine';

/** The actions a player makes (design §7.1): every action but `garbageAccepted`. */
export const PIECE_ACTIONS: readonly PieceActionType[] = Object.values(ActionType).filter(
  (type): type is PieceActionType => type !== ActionType.GarbageAccepted,
);

/**
 * One way or the other: for a move, left is −1 column and right +1; for a stepper or a list, −1 is
 * back (smaller, up) and +1 forward.
 */
export type Direction = -1 | 1;
