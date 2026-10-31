import { type ReactNode, useId } from 'react';
import styles from './radio-group.module.css';

/** One choice in a `RadioGroup`. */
export interface RadioOption<Value extends string> {
  readonly value: Value;
  /** The option's name. */
  readonly label: string;
  /** Shown smaller under the name, and read out as part of it. */
  readonly detail?: ReactNode;
  /** Shown above the name, such as a skin's preview. Decoration: not read out. */
  readonly picture?: ReactNode;
}

export interface RadioGroupProps<Value extends string> {
  /** The group's name, shown as its legend. */
  readonly label: string;
  readonly options: readonly RadioOption<Value>[];
  /** The checked option's value, or `undefined` for none. */
  readonly value: Value | undefined;
  readonly onChange: (value: Value) => void;
}

/**
 * One choice of a few, on native radios sharing a name: Tab reaches the group and the arrows
 * choose, as browsers do for radios. Each option is drawn as a card, the checked one in gold.
 */
export function RadioGroup<Value extends string>({
  label,
  options,
  value,
  onChange,
}: RadioGroupProps<Value>) {
  const name = useId();
  return (
    <div role="radiogroup" aria-labelledby={`${name}-label`} className={styles.group}>
      <div id={`${name}-label`} className={styles.legend}>
        {label}
      </div>
      <div className={styles.options}>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              className={styles.input}
              onChange={() => onChange(option.value)}
            />
            {option.picture !== undefined && (
              <span aria-hidden="true" className={styles.picture}>
                {option.picture}
              </span>
            )}
            <span className={styles.name}>{option.label}</span>
            {option.detail !== undefined && <span className={styles.detail}>{option.detail}</span>}
          </label>
        ))}
      </div>
    </div>
  );
}
