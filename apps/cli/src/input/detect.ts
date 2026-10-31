import { createBasicAdapter } from './basic';
import type { Bindings } from './bindings';
import { createPreciseAdapter } from './precise';
import {
  type InputAdapter,
  type InputSignal,
  keyName,
  type RawKey,
  type TerminalInput,
} from './terminal-input';

/** The adapter `--input` asks for, or `auto` to choose from the first key events (design §7.3). */
export type InputChoice = 'auto' | 'precise' | 'basic';

export const INPUT_CHOICES: readonly InputChoice[] = ['auto', 'precise', 'basic'];

/**
 * Which keyboard encoding a terminal key proves the terminal speaks:
 *
 * - `kitty`: a repeat or release event, which only the Kitty protocol reports, or a key that types
 *   text (a letter, Space, Enter, Esc, Tab, Backspace) sent as a protocol sequence, which has an
 *   event type;
 * - `legacy`: a key that types text, sent as its plain byte, with no event type;
 * - `unknown`: anything else. The protocol sends an unmodified arrow press as `CSI D`, exactly as a
 *   legacy terminal does, and keys such as Delete (`CSI 3~`) look the same either way too.
 */
export function keyProtocol({ input, key }: RawKey): 'kitty' | 'legacy' | 'unknown' {
  if (key.eventType === 'repeat' || key.eventType === 'release') return 'kitty';
  const typesText = key.return || key.escape || key.tab || key.backspace || [...input].length === 1;
  if (!typesText) return 'unknown';
  return key.eventType === undefined ? 'legacy' : 'kitty';
}

/** The adapter for `choice`: a fixed one, or one that chooses (design §7.3). */
export function createInputAdapter(choice: InputChoice, bindings: Bindings): InputAdapter {
  if (choice === 'precise') return createPreciseAdapter(bindings);
  if (choice === 'basic') return createBasicAdapter(bindings);
  return createAutoAdapter(bindings);
}

/**
 * How long after a key that proves nothing (an arrow press) the auto adapter waits for the Kitty
 * protocol's release or repeat before it settles on basic (ms). A key held in a Kitty terminal
 * repeats after the OS delay, which is shorter than this.
 */
export const KITTY_PROOF_WAIT = 1_000;

/**
 * Chooses the adapter from the first key events (design §7.3): precise at the first key that only
 * the Kitty protocol sends, basic at the first legacy one (a key that types text sent as its plain
 * byte, or an arrow sent again with no release between, which is OS key repeat or a quick second
 * tap), or a second after an arrow with no Kitty release or repeat, when the arrow's release is
 * inferred too. Until then it works as the
 * basic adapter, which is safe either way: moves without DAS never slide a tapped piece to the wall.
 */
function createAutoAdapter(bindings: Bindings): InputAdapter {
  let chosen: InputAdapter | null = null;
  // While choosing, a key's release waits as long as the choice: a Kitty terminal's OS delay before
  // the first repeat can be longer than the usual wait (660 ms in X11), and the hold must survive it.
  const basic = createBasicAdapter(bindings, {
    minFirstRepeatWait: () => (chosen ? 0 : KITTY_PROOF_WAIT),
  });
  /** When the first key that proved nothing arrived, while still choosing. */
  let unproven: number | null = null;
  const current = () => chosen ?? basic;
  const settle = (time: number) => {
    if (chosen === null && unproven !== null && time >= unproven + KITTY_PROOF_WAIT) {
      chosen = basic;
    }
  };
  return {
    get name() {
      return chosen?.name ?? 'auto';
    },
    get autoShift() {
      return current().autoShift;
    },
    get deadline() {
      const deadline = current().deadline;
      if (chosen !== null || unproven === null) return deadline;
      return Math.min(deadline ?? Infinity, unproven + KITTY_PROOF_WAIT);
    },
    poll(time) {
      const due = current().poll(time);
      settle(time);
      return due;
    },
    feed(raw: TerminalInput): InputSignal[] {
      settle(raw.time);
      if (chosen) return chosen.feed(raw);
      const protocol = keyProtocol(raw);
      if (protocol === 'kitty') {
        const due = basic.poll(raw.time);
        chosen = createPreciseAdapter(bindings);
        return [...due, ...chosen.feed(raw)];
      }
      const due = basic.poll(raw.time);
      // The Kitty protocol sends a release between two presses of a key: none is a legacy terminal.
      const name = keyName(raw);
      if (protocol === 'legacy' || (name !== null && basic.holds(name))) chosen = basic;
      else unproven ??= raw.time;
      return [...due, ...basic.feed(raw)];
    },
  };
}
