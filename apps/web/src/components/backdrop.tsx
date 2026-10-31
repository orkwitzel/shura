import styles from './backdrop.module.css';

/**
 * The full-window backdrop (design §13.2, Styling): three colour swirls in the theme's swirl
 * colours, drifting slowly, held still under `prefers-reduced-motion`. It sits behind everything
 * and takes no input.
 */
export function Backdrop() {
  return <div className={styles.backdrop} aria-hidden="true" />;
}
