import styles from './logo.module.css';

/** The logo's letters, each in a piece colour. */
const LETTERS = [
  ['S', 'i'],
  ['H', 'o'],
  ['U', 't'],
  ['R', 's'],
  ['A', 'z'],
] as const;

/**
 * "SHURA" in big pixel letters, each in a piece colour, bobbing one after another (held still
 * under `prefers-reduced-motion`). Read out as "Shura".
 */
export function Logo() {
  return (
    <h1 className={styles.logo} aria-label="Shura">
      {LETTERS.map(([letter, piece]) => (
        <span
          key={letter}
          aria-hidden="true"
          className={styles.letter}
          style={{ color: `var(--color-piece-${piece})` }}
        >
          {letter}
        </span>
      ))}
    </h1>
  );
}
