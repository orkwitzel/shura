import { type ComponentProps, useId } from 'react';
import styles from './text-field.module.css';

export interface TextFieldProps
  extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'className'> {
  /** The field's visible label, which also names it. */
  readonly label: string;
  readonly value: string;
  /** Called with the new text on every change. */
  readonly onChange: (value: string) => void;
  /** What's wrong with the value, shown under it (as an alert) and marking it invalid. */
  readonly problem?: string | undefined;
  /** More classes for the field's box. */
  readonly className?: string;
}

/** The keys a text field lets through to what's around it. */
const PASSED_ON = new Set(['Enter', 'Escape', 'Tab']);

/**
 * A one-line text input in the arcade look (design §13.2): a label in the label font over a deep
 * box with a thick border, and under it what's wrong with the value, if anything. Typed text can
 * be selected here, unlike the rest of the page. Keys typed in it stay in it: menus around it
 * don't take them as shortcuts.
 */
export function TextField({
  label,
  value,
  onChange,
  problem,
  className,
  ...props
}: TextFieldProps) {
  const id = useId();
  const problemId = `${id}-problem`;
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        {...props}
        id={id}
        type="text"
        value={value}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={problem !== undefined}
        aria-describedby={problem === undefined ? undefined : problemId}
        className={styles.input}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Typing goes into the field, not to the page's shortcut keys; Enter, Esc and Tab still
          // reach the form, dialog or menu around it.
          if (!PASSED_ON.has(event.key)) event.stopPropagation();
          props.onKeyDown?.(event);
        }}
      />
      {problem !== undefined && (
        <p id={problemId} role="alert" className={styles.problem}>
          {problem}
        </p>
      )}
    </div>
  );
}
