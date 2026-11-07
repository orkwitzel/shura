import type { TimerClock } from '@shura/client-core';
import { useEffect, useState } from 'react';

/** How often the time is read again while running, in ms. */
const TICK_MS = 500;

/**
 * The time on `clock`, read again every half second while `running`: what a view counting seconds
 * (the results' countdown, the quick-match wait) re-renders on.
 */
export function useNow(clock: TimerClock, running: boolean): number {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    if (!running) return;
    let cancel = () => {};
    const tick = () => {
      setNow(clock.now());
      cancel = clock.after(TICK_MS, tick);
    };
    tick();
    return () => cancel();
  }, [clock, running]);
  return now;
}
