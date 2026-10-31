import { type Bindings, type KeyEvent, PIECE_ACTIONS } from '@shura/client-core';
import type { PieceActionType } from '@shura/engine';
import type { KeyName } from './key-names';

/** A browser `keydown` or `keyup`, stamped with the time it arrived on the session's clock. */
export interface RawKey {
  readonly type: 'keydown' | 'keyup';
  readonly code: KeyName;
  /** The browser's own key repeat (`KeyboardEvent.repeat`). */
  readonly repeat: boolean;
  readonly time: number;
}

/** What the adapter makes of a raw key. */
export interface AdaptedKey {
  /** The key event for the input engine, or `null` for nothing. */
  readonly event: KeyEvent | null;
  /**
   * Whether the browser's default action must be stopped: for every game key, so Space and the
   * arrows don't scroll the page (design §13.2, Keyboard), and for no other key.
   */
  readonly preventDefault: boolean;
}

/** Turns one raw key into a key event, under some bindings. */
export type WebAdapter = (raw: RawKey) => AdaptedKey;

/**
 * The web adapter for `bindings` (design §7.3): a bound key's `keydown` is a press of its action
 * and its `keyup` a release. The browser's key repeat is ignored, since the input engine's DAS and
 * ARR move a held key, and unbound keys make nothing.
 */
export function createWebAdapter(bindings: Bindings): WebAdapter {
  const byKey = new Map<KeyName, PieceActionType>();
  for (const action of PIECE_ACTIONS) {
    for (const key of bindings[action]) byKey.set(key, action);
  }
  return ({ type, code, repeat, time }) => {
    const action = byKey.get(code);
    if (action === undefined) return { event: null, preventDefault: false };
    if (repeat) return { event: null, preventDefault: true };
    const kind = type === 'keydown' ? 'press' : 'release';
    return { event: { action, kind, time }, preventDefault: true };
  };
}
