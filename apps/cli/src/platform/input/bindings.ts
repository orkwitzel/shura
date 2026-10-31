import { type Bindings, type KeyEvent, PIECE_ACTIONS } from '@shura/client-core';
import { ActionType, type PieceActionType } from '@shura/engine';
import type { InputSignal } from './input-adapter';
import type { KeyName } from './terminal-input';

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
  for (const action of PIECE_ACTIONS) {
    for (const key of bindings[action]) byKey.set(key, action);
  }
  return byKey;
}

/** What a key doing something makes under some bindings: a signal, or `null` for nothing. */
export type BoundSignal = (
  name: KeyName,
  kind: KeyEvent['kind'],
  time: number,
) => InputSignal | null;

/**
 * What keys make under `bindings`, for every adapter: a key event for a bound key's action, the
 * menu for a menu key's press (design §7.4), and nothing for any other key.
 */
export function boundSignals(bindings: Bindings): BoundSignal {
  const byKey = actionsByKey(bindings);
  return (name, kind, time) => {
    const action = byKey.get(name);
    if (action) return { kind: 'key', event: { action, kind, time } };
    if (MENU_KEYS.includes(name) && kind === 'press') return { kind: 'menu' };
    return null;
  };
}
