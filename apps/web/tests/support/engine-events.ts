import type { SessionEventListener, SoloSession } from '@shura/client-core';
import {
  BOARD_WIDTH,
  type BoardCell,
  type Cell,
  type ClearedRow,
  type EngineEvent,
  type LockEvent,
  type PieceKind,
  TSpin,
} from '@shura/engine';

export interface LockOptions {
  lines?: 0 | 1 | 2 | 3 | 4;
  tSpin?: TSpin;
  perfectClear?: boolean;
  /** The combo after the lock: by default 0 for a clear, -1 for none. */
  combo?: number;
  /** The back-to-back status after the lock. */
  backToBack?: boolean;
  frame?: number;
  /** The piece that locked: by default a T with no cells. */
  piece?: { kind: PieceKind; cells: Cell[] };
  /** The rows cleared: by default `lines` rows from the bottom, full of I cells. */
  clearedRows?: ClearedRow[];
}

/** A cleared row: `cells` (one kind for the whole row by default) at board row `row`. */
export function clearedRow(
  row: number,
  cells: BoardCell[] = Array(BOARD_WIDTH).fill('I'),
): ClearedRow {
  return { row, cells };
}

/** A lock event with what it cleared: by default a lock that clears nothing. */
export function lockEvent({
  lines = 0,
  tSpin = TSpin.None,
  perfectClear = false,
  combo = lines > 0 ? 0 : -1,
  backToBack = false,
  frame = 100,
  piece = { kind: 'T', cells: [] },
  clearedRows = Array.from({ length: lines }, (_, row) => clearedRow(row)),
}: LockOptions = {}): LockEvent {
  return {
    type: 'lock',
    frame,
    clear: { lines, tSpin, perfectClear },
    combo,
    backToBack,
    piece,
    clearedRows,
  };
}

/** A hard drop of `rows` rows: its lock comes next, in the same frame. */
export function hardDropEvent(rows: number, frame = 100): EngineEvent {
  return { type: 'hardDrop', frame, rows };
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
