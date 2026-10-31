import { formatHeadline, type SoloSession, soloResult } from '@shura/client-core';
import { useSession } from '@shura/client-core/react';
import styles from './final-headline.module.css';

export interface FinalHeadlineProps {
  readonly session: SoloSession;
}

/**
 * Once the game has ended, "Finished" or "Game over" and its headline (Sprint's time, or the
 * score), over the board; nothing before. The full results screen replaces it (#44).
 */
export function FinalHeadline({ session }: FinalHeadlineProps) {
  const ended = useSession(session, (state) => state.phase === 'ended');
  const result = ended ? soloResult(session.getState()) : null;
  return (
    <div role="status" className={styles.finalHeadline}>
      {result && (
        <>
          <p className={styles.outcome}>
            {result.outcome === 'finished' ? 'Finished' : 'Game over'}
          </p>
          <p className={styles.headline}>{formatHeadline(result.headline)}</p>
        </>
      )}
    </div>
  );
}
