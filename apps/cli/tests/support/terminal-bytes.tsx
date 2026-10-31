import { type Key, useInput } from 'ink';
import { render } from 'ink-testing-library';
import type { RawKey } from '../../src/input/terminal-input';

function Recorder({ onKey }: { onKey: (raw: RawKey) => void }) {
  useInput((input, key) => onKey({ input, key }));
  return null;
}

/**
 * What Ink's `useInput` makes of terminal bytes: each chunk is written to stdin as one read, as a
 * terminal delivers it, and every key Ink parses out of it is returned in order.
 */
export async function parseTerminalBytes(chunks: readonly string[]): Promise<RawKey[]> {
  const keys: RawKey[] = [];
  const app = render(<Recorder onKey={(raw) => keys.push(raw)} />);
  // useInput subscribes in an effect, after the first render.
  await tick();
  for (const chunk of chunks) {
    app.stdin.write(chunk);
    await tick();
  }
  app.unmount();
  return keys;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A key as Ink reports it, for tests that don't need it parsed from bytes. */
export function inkKey(fields: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false,
    ...fields,
  };
}
