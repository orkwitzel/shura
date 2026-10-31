import { ActionType, type PieceActionType } from '@shura/engine';

/** The actions a player makes (design §7.1): every action but `garbageReceived` and `garbageAccepted`. */
export const PIECE_ACTIONS: readonly PieceActionType[] = Object.values(ActionType).filter(
  (type): type is PieceActionType =>
    type !== ActionType.GarbageReceived && type !== ActionType.GarbageAccepted,
);

/**
 * One way or the other: for a move, left is −1 column and right +1; for a stepper or a list, −1 is
 * back (smaller, up) and +1 forward.
 */
export type Direction = -1 | 1;

/** Each game control's name as a settings screen lists it, in design §7.4's order. */
export const ACTION_LABELS: Readonly<Record<PieceActionType, string>> = {
  [ActionType.MoveLeft]: 'Move left',
  [ActionType.MoveRight]: 'Move right',
  [ActionType.SoftDrop]: 'Soft drop',
  [ActionType.HardDrop]: 'Hard drop',
  [ActionType.RotateCW]: 'Rotate CW',
  [ActionType.RotateCCW]: 'Rotate CCW',
  [ActionType.Rotate180]: 'Rotate 180°',
  [ActionType.Hold]: 'Hold',
};
