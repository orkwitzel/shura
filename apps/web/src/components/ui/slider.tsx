import { useId } from 'react';
import styles from './slider.module.css';

export interface SliderProps {
  /** The slider's name, shown above it. */
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly value: number;
  /** The value as people read it (`167 ms (10 frames)`), shown beside the slider and read out. */
  readonly valueText: string;
  readonly onChange: (value: number) => void;
}

/**
 * A native `<input type="range">` in the arcade look, stepping by whole numbers from `min` to
 * `max`: the arrows, Page Up/Down, Home and End move it from the keyboard. The value shows as text
 * beside it, and screen readers read that text instead of the number.
 */
export function Slider({ label, min, max, value, valueText, onChange }: SliderProps) {
  const id = useId();
  return (
    <div className={styles.slider}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-valuetext={valueText}
        className={styles.input}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output htmlFor={id} className={styles.value}>
        {valueText}
      </output>
    </div>
  );
}
