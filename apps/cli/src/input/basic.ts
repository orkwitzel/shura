import { type Bindings, boundSignals } from './bindings';
import { createKeyRepeatReader, type KeyChange, type KeyRepeatOptions } from './key-repeat';
import type { InputAdapter, InputSignal, KeyName } from './terminal-input';

/** The basic adapter, which can also say which keys it takes to be held. */
export interface BasicAdapter extends InputAdapter {
  holds(name: KeyName): boolean;
}

/**
 * The basic adapter (design §7.3), for terminals that report no releases: a key-repeat reader's
 * presses, repeats and inferred releases, as the bindings name them. The menu (Esc, P) opens on a
 * press only, so a held P opens it once.
 */
export function createBasicAdapter(
  bindings: Bindings,
  options: KeyRepeatOptions = {},
): BasicAdapter {
  const reader = createKeyRepeatReader(options);
  const signal = boundSignals(bindings);
  const signals = (changes: readonly KeyChange[]): InputSignal[] =>
    changes.flatMap(({ name, kind, time }) => signal(name, kind, time) ?? []);
  return {
    name: 'basic',
    autoShift: 'keyRepeat',
    feed: (raw) => signals(reader.feed(raw)),
    poll: (time) => signals(reader.poll(time)),
    get deadline() {
      return reader.deadline;
    },
    holds: reader.holds,
  };
}
