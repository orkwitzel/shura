import type { Bindings } from '@shura/client-core';
import { boundSignals } from './bindings';
import type { InputAdapter } from './input-adapter';
import { keyName } from './terminal-input';

/**
 * The precise adapter for `bindings` (design §7.3): the Kitty keyboard protocol reports real press,
 * repeat and release events. A key without an event type is a press: the protocol leaves the field
 * out of an unmodified press, as with an arrow's `CSI D`. Every release is a real one, so it never
 * needs polling.
 */
export function createPreciseAdapter(bindings: Bindings): InputAdapter {
  const signal = boundSignals(bindings);
  return {
    name: 'precise',
    feed: (raw) => {
      const name = keyName(raw);
      const made = name === null ? null : signal(name, raw.key.eventType ?? 'press', raw.time);
      return made ? [made] : [];
    },
    poll: () => [],
    deadline: null,
  };
}
