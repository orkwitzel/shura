import type { ComponentProps } from 'react';
import styles from './button.module.css';

export interface ButtonProps extends Omit<ComponentProps<'button'>, 'type'> {
  /** `primary` (gold, the default) for the main choice, `secondary` (a panel) for the rest. */
  readonly variant?: 'primary' | 'secondary';
}

/**
 * A native button in the arcade look: a thick ink border and a hard shadow it presses into. It is
 * always `type="button"`, so it never submits a form.
 */
export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ');
  return <button {...props} type="button" className={classes} />;
}
