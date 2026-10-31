import { type LockEvent, TSpin } from '@shura/engine';
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

/** A clear that chains back-to-back: a Tetris, or a T-spin or mini that clears lines (§3). */
function isDifficult({ lines, tSpin }: LockEvent['clear']): boolean {
  return lines === 4 || (lines > 0 && tSpin !== TSpin.None);
}

/**
 * The callouts a lock earns, in order (design §13.1, Callouts): the clear ("SINGLE" to "TETRIS",
 * with "T-SPIN" or "T-SPIN MINI" in front for a T-spin, alone for one that clears nothing), then
 * "BACK-TO-BACK", "COMBO n" from combo 1, and "PERFECT CLEAR". A lock that clears nothing and isn't a
 * T-spin earns none.
 *
 * The lock event carries the back-to-back status *after* the lock, so a back-to-back needs the status
 * before it, `backToBackBefore`: the previous lock's `backToBack` in the same game, false for its
 * first lock. `onCallouts` keeps track of it.
 */
export function lockCallouts(lock: LockEvent, backToBackBefore: boolean): Callout[] {
  const { lines, tSpin, perfectClear } = lock.clear;
  const name = [T_SPIN_NAMES[tSpin], LINE_NAMES[lines]].filter(Boolean).join(' ');
  if (name === '') return [];
  const callouts: Callout[] = [{ kind: 'clear', text: name }];
  if (backToBackBefore && isDifficult(lock.clear)) {
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
 * from the session's engine events. It keeps the back-to-back status before each lock (the previous
 * lock's, false before a game's first), starting again with each new game. Returns a function that
 * stops it.
 */
export function onCallouts(session: SoloSession, listener: CalloutListener): () => void {
  let backToBack = false;
  // A game at frame 0 has locked nothing: a restart (or the first countdown) starts afresh.
  const stopWatching = session.subscribe((state) => {
    if (state.engine.frame === 0) backToBack = false;
  });
  const stopHearing = session.onEvents((events) => {
    for (const event of events) {
      if (event.type !== 'lock') continue;
      const callouts = lockCallouts(event, backToBack);
      backToBack = event.backToBack;
      if (callouts.length > 0) listener(callouts, event);
    }
  });
  return () => {
    stopWatching();
    stopHearing();
  };
}
