import type { ComponentProps } from 'react';
import styles from './panel.module.css';

/** A card in the arcade look: the theme's panel colour, a 4 px cream border and a hard shadow. */
export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section {...props} className={[styles.panel, className].filter(Boolean).join(' ')} />;
}
