import type { Key } from 'ink';

/** One key as Ink's `useInput` reports it: the text it typed and what Ink parsed it as. */
export interface RawKey {
  readonly input: string;
  readonly key: Key;
}

/** A raw key stamped with the time it arrived, on the session's clock (design §7.3). */
export interface TerminalInput extends RawKey {
  readonly time: number;
}

/** The name the CLI's bindings know a key by: an arrow, `space`, `escape`, `enter` or a letter. */
export type KeyName = string;

/**
 * The key `raw` names, or `null` for a key the bindings can't hold: one with Ctrl, Alt, Super or
 * Hyper (terminals report those inconsistently), a modifier on its own, or pasted text. Shift and
 * the lock keys don't change the name, so a key reads the same with Caps Lock on.
 */
export function keyName({ input, key }: RawKey): KeyName | null {
  if (key.ctrl || key.meta || key.super || key.hyper) return null;
  if (key.leftArrow) return 'left';
  if (key.rightArrow) return 'right';
  if (key.upArrow) return 'up';
  if (key.downArrow) return 'down';
  if (key.escape) return 'escape';
  if (key.return) return 'enter';
  if (input === ' ') return 'space';
  if ([...input].length === 1) return input.toLowerCase();
  return null;
}
