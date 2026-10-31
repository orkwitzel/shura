import { type Callout, onCallouts, type SoloSession } from '@shura/client-core';
import { useEffect, useState } from 'react';

/** How long a lock's callouts stay on show, unless a newer lock's take their place. */
export const CALLOUT_MS = 2_000;

/** The callouts on show: the latest lock's that earned any. */
export interface ShownCallouts {
  /** Counts up with each lock, so the overlay can pop each one in afresh. */
  readonly id: number;
  readonly callouts: readonly Callout[];
  /** The lock's combo (-1 or 0 for none), which the callouts grow with. */
  readonly combo: number;
}

/**
 * The callouts of `session`'s latest lock that earned any (design §13.1, Callouts), for 2 s or
 * until a newer lock's take their place; `null` when none are on show.
 */
export function useCallouts(session: SoloSession): ShownCallouts | null {
  const [shown, setShown] = useState<ShownCallouts | null>(null);

  useEffect(
    () =>
      onCallouts(session, (callouts, lock) =>
        setShown((last) => ({ id: (last?.id ?? 0) + 1, callouts, combo: lock.combo })),
      ),
    [session],
  );

  const id = shown?.id;
  useEffect(() => {
    if (id === undefined) return;
    const timer = setTimeout(() => setShown((last) => (last?.id === id ? null : last)), CALLOUT_MS);
    return () => clearTimeout(timer);
  }, [id]);

  return shown;
}
