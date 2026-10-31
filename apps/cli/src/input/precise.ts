import { actionsByKey, type Bindings, MENU_KEYS } from './bindings';
import { type InputAdapter, type InputSignal, keyName, type TerminalInput } from './terminal-input';

/**
 * The key event or menu signal a terminal key makes with the Kitty keyboard protocol, which reports
 * real press, repeat and release events (design §7.3). A key without an event type is a press: the
 * protocol leaves the field out of an unmodified press, as with an arrow's `CSI D`.
 */
export function preciseInput(
  raw: TerminalInput,
  byKey: ReturnType<typeof actionsByKey>,
): InputSignal | null {
  const name = keyName(raw);
  if (name === null) return null;
  const kind = raw.key.eventType ?? 'press';
  const action = byKey.get(name);
  if (action) return { kind: 'key', event: { action, kind, time: raw.time } };
  if (MENU_KEYS.includes(name) && kind === 'press') return { kind: 'menu' };
  return null;
}

/** The precise adapter for `bindings`. */
export function createPreciseAdapter(bindings: Bindings): InputAdapter {
  const byKey = actionsByKey(bindings);
  return { name: 'precise', feed: (raw) => preciseInput(raw, byKey) };
}
