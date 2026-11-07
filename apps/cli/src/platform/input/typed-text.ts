import type { RawKey } from './terminal-input';

/** What Shift makes of the keys whose shifted text a nickname can hold, besides the letters. */
const SHIFTED: Readonly<Record<string, string>> = { '-': '_' };

/**
 * The text a key types into a text field (a nickname, a room code), or `null` for a key that types
 * nothing: a release, an editing or control key, or one with Ctrl, Alt, Super or Hyper.
 *
 * Under the Kitty protocol's "all keys as escape codes" a key reports its unshifted character and
 * Shift as a modifier (design §7.3), so Shift is applied here: a capital, or `_` for `-`. Pasted
 * text comes through as it is.
 */
export function typedText({ input, key }: RawKey): string | null {
  if (key.eventType === 'release') return null;
  if (key.ctrl || key.meta || key.super || key.hyper) return null;
  if (key.return || key.escape || key.tab || key.backspace || key.delete) return null;
  if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return null;
  if (input === '' || input.startsWith('\x1b')) return null;
  if (!key.shift || [...input].length !== 1) return input;
  return SHIFTED[input] ?? input.toUpperCase();
}
