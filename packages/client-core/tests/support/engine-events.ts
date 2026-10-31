import { type EngineEvent, type LockEvent, TSpin } from '@shura/engine';
import type { SessionEventListener, SoloSession } from '../../src/index';

export interface LockOptions {
  lines?: 0 | 1 | 2 | 3 | 4;
  tSpin?: TSpin;
  perfectClear?: boolean;
  /** The combo after the lock: by default 0 for a clear, -1 for none. */
  combo?: number;
  /** The back-to-back status after the lock. */
  backToBack?: boolean;
  frame?: number;
}

/** A lock event with what it cleared: by default a lock that clears nothing. */
export function lockEvent({
  lines = 0,
  tSpin = TSpin.None,
  perfectClear = false,
  combo = lines > 0 ? 0 : -1,
  backToBack = false,
  frame = 100,
}: LockOptions = {}): LockEvent {
  return {
    type: 'lock',
    frame,
    clear: { lines, tSpin, perfectClear },
    combo,
    backToBack,
    piece: { kind: 'T', cells: [] },
    clearedRows: [],
  };
}

/**
 * Takes over `session`'s engine events, for events a real game would take many pieces to reach (a
 * T-spin, a back-to-back): listeners added from now on hear only what `emit` passes them. The rest
 * of the session is real.
 */
export function fakeEngineEvents(session: SoloSession): { emit(...events: EngineEvent[]): void } {
  const listeners = new Set<SessionEventListener>();
  session.onEvents = (listener) => {
    const call: SessionEventListener = (events) => listener(events);
    listeners.add(call);
    return () => {
      listeners.delete(call);
    };
  };
  return {
    emit(...events) {
      for (const listener of listeners) listener(events);
    },
  };
}
