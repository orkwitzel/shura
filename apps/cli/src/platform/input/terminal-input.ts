import type { AutoShift, KeyEvent } from '@shura/client-core';
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

/**
 * What an adapter makes of a terminal key: a key event for the input engine, or the menu binding
 * (Esc, P), which isn't a game control and goes to the UI instead (design §7.4).
 */
export type InputSignal =
  | { readonly kind: 'key'; readonly event: KeyEvent }
  | { readonly kind: 'menu' };

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

/** The adapters, as the status line names them. `auto` is still choosing (design §7.3). */
export type AdapterName = 'precise' | 'basic' | 'auto';

/**
 * How the session's input engine should auto-shift for the key events an adapter makes (design
 * §7.3): by DAS and ARR for the precise adapter's real repeats, and by the key repeat for the basic
 * adapter, which an `auto` adapter works as until it has chosen.
 */
export function autoShiftOf(name: AdapterName): AutoShift {
  return name === 'precise' ? 'handling' : 'keyRepeat';
}

/**
 * Turns terminal keys into key events for one session (design §7.3). The precise adapter is
 * stateless; the basic adapter infers releases from the key-repeat stream, so it also needs polling.
 */
export interface InputAdapter {
  /** Shown in the status line (`input: precise`). Changes once an `auto` adapter has chosen. */
  readonly name: AdapterName;
  /** The signals a terminal key makes, in order: releases that fell due before it come first. */
  feed(raw: TerminalInput): InputSignal[];
  /** The releases inferred by `time` (none from the precise adapter). */
  poll(time: number): InputSignal[];
  /** When the next inferred release (or choice) falls due, or `null`: when to `poll` next. */
  readonly deadline: number | null;
}
