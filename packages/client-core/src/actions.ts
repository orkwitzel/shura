import { ActionType, type PieceActionType } from '@shura/engine';

/** The actions a player makes (design §7.1): every action but `garbageAccepted`. */
export const PIECE_ACTIONS: readonly PieceActionType[] = Object.values(ActionType).filter(
  (type): type is PieceActionType => type !== ActionType.GarbageAccepted,
);
