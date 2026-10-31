import { MENU_KEYS } from './bindings';
import { type KeyName, keyName, type RawKey } from './terminal-input';

const LABELS: Readonly<Record<string, string>> = {
  left: '←',
  right: '→',
  up: '↑',
  down: '↓',
  space: 'Space',
  enter: 'Enter',
  escape: 'Esc',
};

/** A key as screens show it: an arrow, `Space`, `Enter`, `Esc`, or the character (letters capital). */
export function keyLabel(key: KeyName): string {
  return LABELS[key] ?? key.toUpperCase();
}

/** Whether a key pressed on the rebind prompt can be bound, and as what. */
export type Bindable = { readonly key: KeyName } | { readonly refused: string };

/**
 * The key `raw` would bind, or why it can't be bound (design §13.3, Settings screen):
 *
 * - a key the terminal can't report on its own: one with Ctrl, Alt, Super or Hyper, Tab,
 *   Backspace, the function and editing keys (`keyName` has no name for them);
 * - the fixed menu keys, Esc and P (design §7.4);
 * - a key pressed with Shift, which the adapters read as the key alone: the precise adapter drops
 *   the modifier, and the basic adapter reads a capital as its small letter. So Shift+X would bind
 *   X, which isn't what was asked for.
 */
export function bindableKey(raw: RawKey): Bindable {
  const key = keyName(raw);
  if (key === null) return { refused: "The terminal can't report that key on its own." };
  if (MENU_KEYS.includes(key)) {
    return { refused: `${keyLabel(key)} opens the menu, so it can't be bound.` };
  }
  if (raw.key.shift) {
    const label = keyLabel(key);
    return { refused: `Shift+${label} reads as ${label}: press ${label} alone.` };
  }
  return { key };
}
