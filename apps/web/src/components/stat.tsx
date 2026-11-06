import styles from './stat.module.css';

export interface StatProps {
  readonly label: string;
  readonly value: string;
  /**
   * `hud`: a chip sized by the board's cell size, in a HUD beside the well (design §13.2). `row`:
   * a row of a results table.
   */
  readonly look: 'hud' | 'row';
}

/** One stat in a `<dl>`: its label, then its value in the I piece's colour. */
export function Stat({ label, value, look }: StatProps) {
  return (
    <div className={`${styles.stat} ${styles[look]}`}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  );
}
