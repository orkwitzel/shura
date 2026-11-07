import styles from './reconnecting-banner.module.css';

export interface ReconnectingBannerProps {
  /**
   * `top` (the default) across the top of the screen; `hud` in its place, over a match's HUD
   * (design §10.2); `inline` where it's put, as in the spectating banner.
   */
  readonly placement?: 'top' | 'hud' | 'inline';
}

/**
 * "Reconnecting…" while the connection is down and the session tries again (design §10.2): a match
 * plays on locally meanwhile, so nothing else changes.
 */
export function ReconnectingBanner({ placement = 'top' }: ReconnectingBannerProps) {
  return (
    <p role="status" className={`${styles.banner} ${styles[placement]}`}>
      <span className={styles.cell} aria-hidden="true" />
      Reconnecting…
    </p>
  );
}
