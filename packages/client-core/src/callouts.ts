import { type LockEvent, TSpin } from '@shura/engine';
import { isBackToBack, trackBackToBack } from './back-to-back';
import type { SoloSession } from './solo-session';

/** What a callout tells: the clear, a back-to-back, the combo or a perfect clear. */
export type CalloutKind = 'clear' | 'backToBack' | 'combo' | 'perfectClear';

/** A short label for a notable lock (design §13.1, Callouts). */
export interface Callout {
  readonly kind: CalloutKind;
  readonly text: string;
}

const LINE_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'] as const;

const T_SPIN_NAMES: Record<TSpin, string> = {
  [TSpin.None]: '',
  [TSpin.Mini]: 'T-SPIN MINI',
  [TSpin.Full]: 'T-SPIN',
};

/**
 * The callouts a lock earns, in order (design §13.1, Callouts): the clear ("SINGLE" to "TETRIS",
 * with "T-SPIN" or "T-SPIN MINI" in front for a T-spin, alone for one that clears nothing), then
 * "BACK-TO-BACK", "COMBO n" from combo 1, and "PERFECT CLEAR". A lock that clears nothing and isn't a
 * T-spin earns none.
 *
 * The lock event carries the back-to-back status *after* the lock, so a back-to-back needs the status
 * before it, `backToBackBefore`: the previous lock's `backToBack` in the same game, false for its
 * first lock. `trackBackToBack` keeps it, and `onCallouts` uses that.
 */
export function lockCallouts(lock: LockEvent, backToBackBefore: boolean): Callout[] {
  const { lines, tSpin, perfectClear } = lock.clear;
  const name = [T_SPIN_NAMES[tSpin], LINE_NAMES[lines]].filter(Boolean).join(' ');
  if (name === '') return [];
  const callouts: Callout[] = [{ kind: 'clear', text: name }];
  if (isBackToBack(lock, backToBackBefore)) {
    callouts.push({ kind: 'backToBack', text: 'BACK-TO-BACK' });
  }
  if (lock.combo >= 1) callouts.push({ kind: 'combo', text: `COMBO ${lock.combo}` });
  if (perfectClear) callouts.push({ kind: 'perfectClear', text: 'PERFECT CLEAR' });
  return callouts;
}

/** Hears the callouts of a lock that earned any, with the lock (for its combo, say). */
export type CalloutListener = (callouts: readonly Callout[], lock: LockEvent) => void;

/**
 * Passes the callouts of each of `session`'s locks that earns any to `listener`, in frame order,
 * from the session's engine events, with the back-to-back status before each lock from
 * `trackBackToBack`. Returns a function that stops it.
 */
export function onCallouts(session: SoloSession, listener: CalloutListener): () => void {
  const backToBack = trackBackToBack(session);
  const stopHearing = session.onEvents((events) => {
    for (const event of events) {
      if (event.type !== 'lock') continue;
      const callouts = lockCallouts(event, backToBack.next(event));
      if (callouts.length > 0) listener(callouts, event);
    }
  });
  return () => {
    backToBack.stop();
    stopHearing();
  };
}
