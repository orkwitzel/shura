import { type KeyboardEvent, useState } from 'react';
import { keyLabel } from '@/lib/keyboard/key-labels';
import styles from './key-capture.module.css';

export interface KeyCaptureProps {
  /** What the key is for (`Hold`), the start of the button's accessible name. */
  readonly label: string;
  /** The key, by its web key name (`KeyboardEvent.code`), or `undefined` for a slot that adds one. */
  readonly value: string | undefined;
  /**
   * Called with the code of the key pressed while it waits. Returns why that key can't be bound,
   * to keep waiting for another, or `undefined` to take it.
   */
  readonly onCapture: (code: string) => string | undefined;
  /** Called on Delete or Backspace, to unbind the key. */
  readonly onClear?: () => void;
}

/**
 * A "press a key" button for a binding (design §7.4). Enter, Space or a click makes it wait for a
 * key, and the next key pressed is captured by its `KeyboardEvent.code`: any key, modifiers alone
 * included, except that Esc cancels and Tab moves on (leaving it cancels too). While it waits, the
 * key it captures does nothing else, and Esc reaches nothing outside it. The browser's key repeat
 * is ignored, so a held Enter doesn't bind itself. Delete or Backspace clears the key.
 */
export function KeyCapture({ label, value, onCapture, onClear }: KeyCaptureProps) {
  const [waiting, setWaiting] = useState(false);
  const [refused, setRefused] = useState<string | undefined>();
  const shown = value === undefined ? '+' : keyLabel(value);
  const stop = () => {
    setWaiting(false);
    setRefused(undefined);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!waiting) {
      if ((event.key === 'Delete' || event.key === 'Backspace') && onClear) {
        event.preventDefault();
        onClear();
      }
      return;
    }
    if (event.code === 'Tab' || event.key === 'Tab') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (event.key === 'Escape') {
      stop();
      return;
    }
    const why = onCapture(event.code);
    if (why === undefined) stop();
    else setRefused(why);
  };

  return (
    <span className={styles.keyCapture}>
      <button
        type="button"
        className={styles.button}
        data-waiting={waiting || undefined}
        data-empty={value === undefined || undefined}
        aria-label={`${label}: ${waiting ? 'press a key' : value === undefined ? 'add a key' : shown}`}
        onClick={() => setWaiting(true)}
        onKeyDown={onKeyDown}
        onBlur={stop}
      >
        {waiting ? 'Press a key' : shown}
      </button>
      {refused !== undefined && (
        <span role="status" className={styles.refused}>
          {refused}
        </span>
      )}
    </span>
  );
}
