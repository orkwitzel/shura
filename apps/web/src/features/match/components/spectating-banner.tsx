import { useHotkeys } from 'react-hotkeys-hook';
import { Button } from '@/components/ui/button';
import { SCREEN_HOTKEYS } from '@/lib/keyboard/screen-hotkeys';
import styles from './spectating-banner.module.css';

export interface SpectatingBannerProps {
  /** What follows "Spectating": why you're watching, what comes next. */
  readonly detail?: string;
  /** Leave (Esc, or a click): out of the room. */
  readonly onLeave: () => void;
}

/**
 * The banner over a match you're watching (design §13.2, Match): once you're out, your board greys
 * and this says you're spectating, with *Leave* (Esc), unless something on the page has already
 * handled the Esc.
 */
export function SpectatingBanner({ detail, onLeave }: SpectatingBannerProps) {
  useHotkeys(
    'escape',
    (event) => {
      event.preventDefault();
      onLeave();
    },
    SCREEN_HOTKEYS,
  );
  return (
    <div className={styles.banner} role="status">
      <span className={styles.title}>Spectating</span>
      {detail && <span className={styles.detail}>{detail}</span>}
      <Button variant="secondary" className={styles.leave} onClick={onLeave}>
        <kbd>Esc</kbd> Leave
      </Button>
    </div>
  );
}
