import { type LockEvent, TSpin } from '@shura/engine';
import type { SessionEventListener } from '../solo/solo-session';

/** A clear that chains back-to-back: a Tetris, or a T-spin or mini that clears lines (§3). */
function isDifficult({ lines, tSpin }: LockEvent['clear']): boolean {
  return lines === 4 || (lines > 0 && tSpin !== TSpin.None);
}

/**
 * Whether `lock` is a back-to-back: a difficult clear (§3) made while the back-to-back status was
 * already on. `backToBackBefore` is that status before the lock, which a `BackToBackTracker` keeps.
 */
export function isBackToBack(lock: LockEvent, backToBackBefore: boolean): boolean {
  return backToBackBefore && isDifficult(lock.clear);
}

/**
 * A session's back-to-back status before each of its locks. A lock event carries the status *after*
 * the lock, so the status before one is the previous lock's, off before a game's first.
 */
export interface BackToBackTracker {
  /**
   * The status before `lock`, the session's next lock, and then moves past it. Call it once for
   * each lock, in frame order.
   */
  next(lock: LockEvent): boolean;
  /** Stops following the session. */
  stop(): void;
}

/**
 * A game whose locks are followed (a single-player session, or your game in an online match): its
 * engine events, and, for a session that starts new games in place, its state.
 */
export interface GameEvents {
  onEvents(listener: SessionEventListener): () => void;
  /**
   * The state, after each change: a game at frame 0 has locked nothing, so it is a new one (a
   * single-player restart). An online match's game never starts again, and goes without.
   */
  subscribe?(
    listener: (state: { readonly engine: { readonly frame: number } }) => void,
  ): () => void;
}

/**
 * Keeps `game`'s back-to-back status before each lock, starting again with each new game it
 * starts (a game at frame 0 has locked nothing: a restart, or the first countdown).
 */
export function trackBackToBack(game: Pick<GameEvents, 'subscribe'> = {}): BackToBackTracker {
  let backToBack = false;
  const stop =
    game.subscribe?.(({ engine }) => {
      if (engine.frame === 0) backToBack = false;
    }) ?? (() => {});
  return {
    next(lock) {
      const before = backToBack;
      backToBack = lock.backToBack;
      return before;
    },
    stop,
  };
}
