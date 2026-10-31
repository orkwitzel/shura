import { Logo } from './logo';
import styles from './needs-keyboard.module.css';
import { Panel } from './panel';

/**
 * What a touch device with no keyboard sees instead of the app (design §13.2, Devices): Shura is
 * played with a keyboard, and touch controls are deferred (§16).
 */
export function NeedsKeyboard() {
  return (
    <main>
      <Panel>
        <Logo />
        <h2 className={styles.title}>Shura needs a keyboard</h2>
        <p className={styles.text}>
          Open Shura on a computer, or connect a keyboard to this device, to play.
        </p>
      </Panel>
    </main>
  );
}
