import type { SoloSession } from '@shura/client-core';
import type { CSSProperties } from 'react';
import { useEffects } from '@/hooks/use-effects';
import { useCallouts } from '../hooks/use-callouts';
import styles from './callouts.module.css';

export interface CalloutsProps {
  readonly session: SoloSession;
}

/** The combo the callouts stop growing at. */
const MAX_GROWTH = 10;

/**
 * The callouts of the session's latest notable lock, beside the board (design §13.1, Callouts;
 * §13.2, Effects): "T-SPIN DOUBLE", "BACK-TO-BACK", "COMBO 3", "PERFECT CLEAR". They carry
 * information, so they show in every *Effects* setting: under *Full* and *Reduced* they pop in and
 * grow with the combo, and with effects *Off* they are plain text.
 */
export function Callouts({ session }: CalloutsProps) {
  const shown = useCallouts(session);
  const lively = useEffects() !== 'off';
  const style = lively
    ? ({ '--combo': Math.min(Math.max(shown?.combo ?? 0, 0), MAX_GROWTH) } as CSSProperties)
    : undefined;
  return (
    <div role="status" aria-label="Callouts" className={styles.callouts}>
      {shown && (
        <ul
          // A new key for each lock starts the pop-in again.
          key={shown.id}
          className={styles.list}
          data-pop={lively ? '' : undefined}
          style={style}
        >
          {shown.callouts.map(({ kind, text }) => (
            <li key={kind} className={styles[kind]}>
              {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
