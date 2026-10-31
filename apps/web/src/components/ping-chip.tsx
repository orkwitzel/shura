import styles from './ping-chip.module.css';

/** How good a round trip is (design §13.2, Lobby): green under 80 ms, yellow under 150, red above. */
export function pingQuality(ms: number): 'good' | 'fair' | 'poor' {
  if (ms < 80) return 'good';
  if (ms < 150) return 'fair';
  return 'poor';
}

/**
 * The player's own ping, in milliseconds, coloured by how good it is: a pixel chip for the lobby's
 * corner and the match HUD. Nothing until the first ping is back.
 */
export function PingChip({ ping }: { readonly ping: number | null }) {
  if (ping === null) return null;
  const quality = pingQuality(ping);
  return (
    <span className={`${styles.chip} ${styles[quality]}`} data-quality={quality}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>Ping</span> {Math.round(ping)} ms
    </span>
  );
}
