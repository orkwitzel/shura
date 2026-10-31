import type { Clock } from '@shura/client-core';
import { useInput } from 'ink';
import { useRef } from 'react';
import { createKeyRepeatReader, type KeyRepeatReader } from './key-repeat';
import { eventTypeOf, keyName, type RawKey } from './terminal-input';

export interface ScreenKeysOptions {
  /** Whether the screen takes keys (`true` by default): not while it can't be seen. */
  readonly active?: boolean;
  /** What times the keys, to tell a key's OS repeat from a new press. The system's by default. */
  readonly clock?: Pick<Clock, 'now'> | undefined;
}

const SYSTEM_CLOCK: Pick<Clock, 'now'> = { now: () => performance.now() };

/**
 * A screen's own keys, outside a game: `onKey` hears each key while `active`, and whether it was a
 * press. Keys that come while it isn't are dropped here, rather than by unsubscribing: with no
 * `useInput` active, Ink stops reading the terminal and would hand them over once it could.
 *
 * A key-repeat reader tells presses from the key repeat where the terminal doesn't (design §7.3),
 * so the OS repeat of a held key (the Enter that opened a prompt) isn't another press. A key with no
 * name can't repeat in the reader's eyes: its event type says what it was.
 */
export function useScreenKeys(
  { active = true, clock = SYSTEM_CLOCK }: ScreenKeysOptions,
  onKey: (raw: RawKey, press: boolean) => void,
): void {
  const readerRef = useRef<KeyRepeatReader | null>(null);
  readerRef.current ??= createKeyRepeatReader();
  const reader = readerRef.current;
  useInput((input, key) => {
    if (!active) return;
    const raw = { input, key };
    const changes = reader.feed({ ...raw, time: clock.now() });
    const press =
      keyName(raw) === null ? eventTypeOf(key) === 'press' : changes.at(-1)?.kind === 'press';
    onKey(raw, press);
  });
}
