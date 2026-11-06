import { errorText, type OnlineConnection } from '@shura/client-core';
import { useHotkeys } from 'react-hotkeys-hook';
import { Button } from '@/components/ui/button';
import { SCREEN_HOTKEYS } from '@/lib/keyboard/screen-hotkeys';
import styles from './connection-screen.module.css';

export interface ConnectionScreenProps {
  /** Any status but connected: opening, failed, or closed. */
  readonly connection: OnlineConnection;
  /** Enter, or *Retry*, after a failure: try again. */
  readonly onRetry: () => void;
  /** Esc: leave online play. */
  readonly onBack: () => void;
  /** Enter after a version mismatch: reload the page, which brings the new version. */
  readonly onReload: () => void;
}

/**
 * What online play shows until it's connected (design §13.2, Online): "Connecting…"; "Can't reach
 * the server" with *Retry* (or the server's words for another failure, such as a limit); and after
 * a version mismatch (§8.3), "A new version of Shura is out", where Enter reloads the page. Esc
 * leaves online play from any of them.
 */
export function ConnectionScreen({ connection, onRetry, onBack, onReload }: ConnectionScreenProps) {
  const failure = connection.status === 'failed' ? connection : null;
  const outdated = failure?.reason === 'version_mismatch';
  useHotkeys(
    'escape',
    (event) => {
      event.preventDefault();
      onBack();
    },
    SCREEN_HOTKEYS,
  );
  useHotkeys(
    'enter',
    (event) => {
      // Also stops the focused button clicking itself as well.
      event.preventDefault();
      if (outdated) onReload();
      else onRetry();
    },
    { ...SCREEN_HOTKEYS, enabled: failure !== null },
  );

  if (!failure) {
    return (
      <div className={styles.screen}>
        <span className={styles.spinner} aria-hidden="true" />
        <p role="status" className={styles.connecting}>
          Connecting…
        </p>
        <p className={styles.hint}>
          <kbd>Esc</kbd> back
        </p>
      </div>
    );
  }
  if (outdated) {
    return (
      <div className={styles.screen}>
        <h2 className={styles.title}>A new version of Shura is out</h2>
        <p className={styles.lead}>Reload the page to get it, then play online.</p>
        <Button autoFocus onClick={onReload}>
          <kbd>Enter</kbd> Reload
        </Button>
      </div>
    );
  }
  const unreachable = failure.reason === 'unreachable';
  return (
    <div className={styles.screen}>
      <h2 className={styles.title}>
        {unreachable ? 'Can’t reach the server' : 'Can’t play online'}
      </h2>
      <p className={styles.lead}>
        {unreachable
          ? 'Check your connection and try again.'
          : errorText(failure.reason, failure.message)}
      </p>
      <div className={styles.buttons}>
        <Button variant="secondary" onClick={onBack}>
          <kbd>Esc</kbd> Back
        </Button>
        <Button autoFocus onClick={onRetry}>
          <kbd>Enter</kbd> Retry
        </Button>
      </div>
    </div>
  );
}
