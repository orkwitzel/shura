import styles from './reconnecting-banner.module.css';

/**
 * "Reconnecting…" over the screen while the connection is down and the session tries again
 * (design §10.2): a match plays on locally meanwhile, so nothing else changes.
 */
export function ReconnectingBanner() {
  return (
    <p role="status" className={styles.banner}>
      <span className={styles.cell} aria-hidden="true" />
      Reconnecting…
    </p>
  );
}
