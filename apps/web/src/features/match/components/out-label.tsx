import { OUT_WORDS, ordinal, type RosterEntry } from '@shura/client-core';
import styles from './out-label.module.css';

export interface OutLabelProps {
  /** The player's entry in the match's roster (client-core's `rosterEntryOf`), if any. */
  readonly entry: RosterEntry | undefined;
}

/**
 * Over an out board's greyed well (design §13.2, Match): the player's place so far (the server's
 * once the match has ended), big, and why they're out (*topped out*, *lagged out*, *removed*,
 * *left*). Nothing for a player still in.
 */
export function OutLabel({ entry }: OutLabelProps) {
  if (!entry?.out) return null;
  const { place, out } = entry;
  return (
    <div className={styles.out} role="status">
      {place !== null && <span className={styles.place}>{ordinal(place).toUpperCase()}</span>}
      <span className={styles.reason}>{OUT_WORDS[out.reason]}</span>
    </div>
  );
}
