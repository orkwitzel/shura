import { OUT_WORDS, ordinal } from '@shura/client-core';
import type { OutReason } from '@shura/protocol';
import styles from './out-label.module.css';

export interface OutLabelProps {
  /** Their place so far, or the server's once the match has ended. */
  readonly place: number | null;
  readonly reason: OutReason;
}

/**
 * Over an out board's greyed well (design §13.2, Match): the player's place, big, and why they're
 * out (*topped out*, *lagged out*, *removed*, *left*).
 */
export function OutLabel({ place, reason }: OutLabelProps) {
  return (
    <div className={styles.out} role="status">
      {place !== null && <span className={styles.place}>{ordinal(place).toUpperCase()}</span>}
      <span className={styles.reason}>{OUT_WORDS[reason]}</span>
    </div>
  );
}
