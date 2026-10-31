import { countdownLabel, type SoloSession } from '@shura/client-core';
import { useSession } from '@shura/client-core/react';
import styles from './countdown.module.css';

export interface CountdownProps {
  readonly session: SoloSession;
}

/**
 * "3, 2, 1, GO" over the board (design §13.1, Countdown), for a new game, a restart and a resume,
 * from client-core's `countdownLabel`; nothing the rest of the time. Each step pops in.
 */
export function Countdown({ session }: CountdownProps) {
  const label = useSession(session, countdownLabel);
  if (label === null) return null;
  return (
    <div role="timer" aria-label="Countdown" className={styles.countdown}>
      <span key={label} className={label === 'GO' ? styles.go : styles.step}>
        {label}
      </span>
    </div>
  );
}
