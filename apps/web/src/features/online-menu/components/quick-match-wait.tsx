import { formatWait } from '@shura/client-core';
import { useEffect, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Button } from '@/components/ui/button';
import { SCREEN_HOTKEYS } from '@/lib/keyboard/screen-hotkeys';
import styles from './quick-match-wait.module.css';

export interface QuickMatchWaitProps {
  /** Waiting in the queue, or back here because the quick-match opponent left. */
  readonly status: 'searching' | 'opponentLeft';
  /** When the wait began, on `performance.now()`'s clock. */
  readonly since: number;
  /** Esc: stop waiting (or, after the opponent left, go back to the menu). */
  readonly onCancel: () => void;
  /** Enter, after the opponent left: look for another. */
  readonly onSearchAgain: () => void;
}

/** The time since `since`, in ms, updated a few times a second. */
function useElapsed(since: number): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, now - since);
}

/**
 * The quick-match waiting screen (design §13.2, Online): the time waited and *Cancel* (Esc). A
 * match found goes straight on to the room, so this screen only ever ends by leaving it. After
 * the quick-match opponent left: "Opponent left", with Enter to look for another.
 */
export function QuickMatchWait({ status, since, onCancel, onSearchAgain }: QuickMatchWaitProps) {
  const elapsed = useElapsed(since);
  useHotkeys(
    'escape',
    (event) => {
      event.preventDefault();
      onCancel();
    },
    SCREEN_HOTKEYS,
  );
  useHotkeys(
    'enter',
    (event) => {
      event.preventDefault();
      onSearchAgain();
    },
    { ...SCREEN_HOTKEYS, enabled: status === 'opponentLeft' },
  );

  if (status === 'opponentLeft') {
    return (
      <div className={styles.wait}>
        <h2 className={styles.title}>Opponent left</h2>
        <p className={styles.lead}>Look for another?</p>
        <div className={styles.buttons}>
          <Button variant="secondary" onClick={onCancel}>
            <kbd>Esc</kbd> Back
          </Button>
          <Button onClick={onSearchAgain}>
            <kbd>Enter</kbd> Quick match
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.wait}>
      <h2 className={styles.title}>Quick match</h2>
      <div className={styles.searching} aria-hidden="true">
        {[0, 1, 2, 3].map((cell) => (
          <span key={cell} className={styles.cell} style={{ animationDelay: `${cell * 120}ms` }} />
        ))}
      </div>
      <p className={styles.lead}>Looking for an opponent…</p>
      <p role="timer" aria-label="Time waited" className={styles.time}>
        {formatWait(elapsed)}
      </p>
      <Button variant="secondary" onClick={onCancel}>
        <kbd>Esc</kbd> Cancel
      </Button>
    </div>
  );
}
