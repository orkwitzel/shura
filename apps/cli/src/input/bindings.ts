import { ActionType, type PieceActionType } from '@shura/engine';
import type { KeyName } from './terminal-input';

/** The keys bound to each game control. A key is bound to one action at most. */
export type Bindings = Readonly<Record<PieceActionType, readonly KeyName[]>>;

/**
 * The CLI's default bindings (design §7.4). Terminals can't report Ctrl or Shift on their own, so
 * they leave them out.
 */
export const DEFAULT_BINDINGS: Bindings = {
  [ActionType.MoveLeft]: ['left'],
  [ActionType.MoveRight]: ['right'],
  [ActionType.SoftDrop]: ['down'],
  [ActionType.HardDrop]: ['space'],
  [ActionType.RotateCW]: ['up', 'x'],
  [ActionType.RotateCCW]: ['z'],
  [ActionType.Rotate180]: ['a'],
  [ActionType.Hold]: ['c'],
};

/** The menu binding during a single-player game (design §7.4), fixed. */
export const MENU_KEYS: readonly KeyName[] = ['escape', 'p'];

/** The action each bound key controls. */
export function actionsByKey(bindings: Bindings): ReadonlyMap<KeyName, PieceActionType> {
  const byKey = new Map<KeyName, PieceActionType>();
  for (const [action, keys] of Object.entries(bindings) as [
    PieceActionType,
    readonly KeyName[],
  ][]) {
    for (const key of keys) byKey.set(key, action);
  }
  return byKey;
}
