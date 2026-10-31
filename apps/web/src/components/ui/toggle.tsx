import styles from './toggle.module.css';

export interface ToggleProps {
  /** The setting's name, beside the switch. */
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

/**
 * An on/off switch: a native checkbox (Space flips it) with the switch role, drawn as a pixel
 * switch with ON or OFF on it.
 */
export function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className={styles.toggle}>
      <span className={styles.label}>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        className={styles.input}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span aria-hidden="true" className={styles.track} data-checked={checked || undefined}>
        <span className={styles.thumb} />
        {checked ? 'ON' : 'OFF'}
      </span>
    </label>
  );
}
