import type { EventEmitter } from 'node:events';
import type { AutoShift, Clock, SoloSession } from '@shura/client-core';
import { useInput, useStdin } from 'ink';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Bindings } from '../input/bindings';
import type { CaptureEntry, CaptureFile } from '../input/capture';
import { createInputAdapter, type InputChoice } from '../input/detect';
import type {
  AdapterName,
  InputAdapter,
  InputSignal,
  TerminalInput,
} from '../input/terminal-input';

/** How keys are read: the adapter choice and the hidden `--debug-input` (design §7.3). */
export interface InputOptions {
  readonly choice: InputChoice;
  /** Keep a log of raw keys and what they made, for the debug panel. */
  readonly debug?: boolean;
  /** Where the log is also written, with `debug`. */
  readonly capture?: CaptureFile;
}

/** How many entries the debug log keeps: what the panel has room for. */
export const DEBUG_LOG_SIZE = 18;

export interface TerminalInputState {
  /** The adapter, for the status line. */
  readonly adapter: AdapterName;
  /** The latest raw keys and inferred releases, oldest first (`debug` only). */
  readonly log: readonly CaptureEntry[];
}

interface TerminalInputProps {
  readonly session: Pick<SoloSession, 'key' | 'setInput'>;
  /** The session's clock, which also stamps keys and wakes the adapter's polling. */
  readonly clock: Clock;
  readonly bindings: Bindings;
  readonly options: InputOptions;
  /** The menu binding was pressed (Esc, P). */
  readonly onMenu?: (() => void) | undefined;
  /**
   * Sees each terminal key before the adapter: a screen's own shortcut (the in-game menu's, the
   * results'). Returns whether it took the key, which then never reaches the adapter.
   */
  readonly shortcut?: ((raw: TerminalInput) => boolean) | undefined;
  /**
   * Whether keys reach the session (`true` by default). While another screen takes the keys (the
   * settings), none do, and every game control is let go as it starts, since the releases would be
   * missed.
   */
  readonly active?: boolean;
}

/**
 * Feeds the terminal's keys to `session` through the adapter `options` asks for: its key events to
 * `session.key`, its auto-shift to `session.setInput` (again once an auto adapter has chosen), and
 * polls it while it owes an inferred release. New bindings get a new adapter of the kind already
 * chosen, and let go of every game control, since the old adapter's holds are gone with it.
 */
export function useTerminalInput({
  session,
  clock,
  bindings,
  options,
  onMenu,
  shortcut,
  active = true,
}: TerminalInputProps): TerminalInputState {
  // The adapter in use, replaced when the bindings change.
  const [reading] = useState<{ adapter: InputAdapter }>(() => ({
    adapter: createInputAdapter(options.choice, bindings),
  }));
  const [name, setName] = useState(reading.adapter.name);
  const [log, setLog] = useState<readonly CaptureEntry[]>([]);
  const autoShift = useRef<AutoShift | null>(null);
  const wake = useRef<(() => void) | null>(null);
  const bytes = useRef<string | null>(null);
  const shown = useRef(reading.adapter.name);
  const menu = useRef(onMenu);
  menu.current = onMenu;

  const deliver = (signals: readonly InputSignal[], raw: string | null, time: number) => {
    const { adapter } = reading;
    if (adapter.autoShift !== autoShift.current) {
      autoShift.current = adapter.autoShift;
      session.setInput({ autoShift: adapter.autoShift });
    }
    for (const signal of signals) {
      if (signal.kind === 'key') session.key(signal.event);
      else menu.current?.();
    }
    const changed = adapter.name !== shown.current;
    shown.current = adapter.name;
    setName(adapter.name);
    if (options.debug && (raw !== null || signals.length > 0 || changed)) {
      const entry: CaptureEntry = { time, bytes: raw, adapter: adapter.name, signals };
      options.capture?.write(entry);
      setLog((entries) => [...entries, entry].slice(-DEBUG_LOG_SIZE));
    }
    if (wake.current === null && adapter.deadline !== null) {
      wake.current = clock.schedule(() => {
        wake.current = null;
        const now = clock.now();
        deliver(reading.adapter.poll(now), null, now);
      });
    }
  };

  // The session's input engine auto-shifts as the adapter needs from the start (and again for a new
  // adapter, through `deliver`).
  useEffect(() => {
    autoShift.current = reading.adapter.autoShift;
    session.setInput({ autoShift: reading.adapter.autoShift });
    return () => wake.current?.();
  }, []);

  /** Releases every game control, so none is left held. */
  const releaseAll = () => {
    const time = clock.now();
    for (const action of Object.keys(bindings) as (keyof Bindings)[]) {
      session.key({ action, kind: 'release', time });
    }
  };

  // Bindings changed in the settings apply from now (design §7.4): a new adapter of the kind
  // already chosen, so an auto adapter that has chosen doesn't start over.
  // A settings change makes new bindings objects even when they are the same, so compare contents.
  const bindingsKey = JSON.stringify(bindings);
  const built = useRef(bindingsKey);
  useLayoutEffect(() => {
    if (built.current === bindingsKey) return;
    built.current = bindingsKey;
    wake.current?.();
    wake.current = null;
    const { name } = reading.adapter;
    reading.adapter = createInputAdapter(name === 'auto' ? options.choice : name, bindings);
    releaseAll();
    deliver([], null, clock.now());
  }, [bindingsKey]);

  // Another screen takes the keys from here: the releases of keys held now would be missed.
  useLayoutEffect(() => {
    if (!active) releaseAll();
  }, [active]);

  // The raw bytes of each key, for the debug log. Ink parses them before `useInput` sees the key and
  // keeps them to itself, so this listens where Ink hands each key's bytes to `useInput`; it is
  // subscribed first, so it hears each key just before `useInput` does.
  const { internal_eventEmitter: keys } = useStdin() as ReturnType<typeof useStdin> & {
    internal_eventEmitter?: EventEmitter;
  };
  useEffect(() => {
    if (!options.debug || !keys || !active) return;
    const onKey = (data: unknown) => {
      bytes.current = String(data);
    };
    keys.on('input', onKey);
    return () => {
      keys.off('input', onKey);
    };
  }, [options.debug, keys, active]);

  useInput(
    (input, key) => {
      const time = clock.now();
      const raw = bytes.current ?? input;
      bytes.current = null;
      if (shortcut?.({ input, key, time })) return;
      deliver(reading.adapter.feed({ input, key, time }), raw, time);
    },
    { isActive: active },
  );

  return { adapter: name, log };
}
