import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
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
  const leave = useRef(onLeave);
  leave.current = onLeave;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' || event.repeat || event.defaultPrevented) return;
      event.preventDefault();
      leave.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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
