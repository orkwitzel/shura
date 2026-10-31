import styles from './countdown.module.css';

export interface CountdownProps {
  /** The label now, from client-core's `countdownLabel`, or `null` for none. */
  readonly label: string | null;
}

/**
 * "3, 2, 1, GO" over the board (design §13.1, Countdown), for a new game, a restart, a resume and
 * a match; nothing the rest of the time. Each step pops in.
 */
export function Countdown({ label }: CountdownProps) {
  if (label === null) return null;
  return (
    <div role="timer" aria-label="Countdown" className={styles.countdown}>
      <span key={label} className={label === 'GO' ? styles.go : styles.step}>
        {label}
      </span>
    </div>
  );
}
