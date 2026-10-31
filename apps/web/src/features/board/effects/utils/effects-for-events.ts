import { type Effects, framesToMs, isBackToBack } from '@shura/client-core';
import {
  type BoardCell,
  type Cell,
  type EngineEvent,
  type LockEvent,
  type PieceKind,
  TSpin,
} from '@shura/engine';

/** A filled board cell: where it is (row 0 at the bottom) and what filled it. */
export interface EffectCell {
  readonly col: number;
  readonly row: number;
  readonly kind: Exclude<BoardCell, null>;
}

interface Timed {
  /**
   * How long after the first of the events it came from it starts, in ms: the events of one wake
   * can span several frames, and each effect waits for its own.
   */
  readonly delay: number;
}

/** A burst of pixel particles from cells, in the cells' colours. */
export interface BurstEffect extends Timed {
  readonly type: 'burst';
  readonly cells: readonly EffectCell[];
  /** How many particles each cell bursts into. */
  readonly particles: number;
}

/** The cleared rows flashing, where they were. */
export interface FlashEffect extends Timed {
  readonly type: 'flash';
  /** The board rows that cleared (row 0 at the bottom), as they were before clearing. */
  readonly rows: readonly number[];
}

/** The board shaking, after a clear of 2 or more lines. */
export interface ShakeEffect extends Timed {
  readonly type: 'shake';
  /** How far it shakes at first, in CSS pixels. */
  readonly strength: number;
}

/** A hard-dropped piece's trail, from where it fell from down to where it locked. */
export interface TrailEffect extends Timed {
  readonly type: 'trail';
  readonly kind: PieceKind;
  /** The cells it locked in. */
  readonly cells: readonly Cell[];
  /** How many rows it fell. */
  readonly rows: number;
}

/** The board nudged down and back, by a hard drop. */
export interface NudgeEffect extends Timed {
  readonly type: 'nudge';
  /** How far down, in CSS pixels. */
  readonly distance: number;
}

/** The locked piece's cells brightening for a moment. */
export interface GlowEffect extends Timed {
  readonly type: 'glow';
  readonly kind: PieceKind;
  /** Its cells left on the board once the lock's rows cleared, where they are now. */
  readonly cells: readonly Cell[];
}

/** The board's border pulsing in the accent colour, on a level-up. */
export interface PulseEffect extends Timed {
  readonly type: 'pulse';
}

/** The stack fading to grey from the top, on a top-out. It lasts until the next game. */
export interface FadeEffect extends Timed {
  readonly type: 'fade';
}

/** What to draw for an engine event (design §13.2, Effects). */
export type Effect =
  | BurstEffect
  | FlashEffect
  | ShakeEffect
  | TrailEffect
  | NudgeEffect
  | GlowEffect
  | PulseEffect
  | FadeEffect;

/** Particles per cleared cell, by lines cleared. */
const BURST_BY_LINES = [0, 2, 3, 4, 6] as const;

/** The combo bursts stop growing at, as the callouts do. */
const MAX_COMBO_GROWTH = 10;

/** How much bigger a T-spin's, a back-to-back's or a perfect clear's burst is. */
const BIG_MOMENT = 2;

/** How hard the board shakes, in CSS pixels, by lines cleared: only for 2 or more. */
const SHAKE_BY_LINES = [0, 0, 3, 4, 6] as const;

/** How far a hard drop nudges the board down, in CSS pixels. */
const NUDGE = 3;

/** The effects *Reduced* leaves out: everything that moves the board or streaks across it. */
const MOVING: ReadonlySet<Effect['type']> = new Set(['shake', 'nudge', 'trail']);

/** The cells a lock's burst comes from: the cleared rows', or a T-spin's piece if it cleared none. */
function burstCells(lock: LockEvent): EffectCell[] {
  if (lock.clearedRows.length === 0) {
    return lock.piece.cells.map(({ col, row }) => ({ col, row, kind: lock.piece.kind }));
  }
  return lock.clearedRows.flatMap(({ row, cells }) =>
    cells.flatMap((kind, col) => (kind === null ? [] : [{ col, row, kind }])),
  );
}

/** A lock's burst, if it earns one: a clear's, or a T-spin's that clears nothing. */
function burstOf(lock: LockEvent, backToBack: boolean, delay: number): BurstEffect | null {
  const { lines, tSpin, perfectClear } = lock.clear;
  if (lines === 0 && tSpin === TSpin.None) return null;
  const combo = Math.min(Math.max(lock.combo, 0), MAX_COMBO_GROWTH);
  const big = tSpin !== TSpin.None || backToBack || perfectClear;
  const particles = (BURST_BY_LINES[lines === 0 ? 1 : lines] + combo) * (big ? BIG_MOMENT : 1);
  return { type: 'burst', cells: burstCells(lock), particles, delay };
}

/** The locked piece's cells that are left once its rows cleared, moved down as the rows above. */
function cellsAfterClearing({ piece, clearedRows }: LockEvent): Cell[] {
  const cleared = clearedRows.map(({ row }) => row);
  return piece.cells
    .filter(({ row }) => !cleared.includes(row))
    .map(({ col, row }) => ({ col, row: row - cleared.filter((below) => below < row).length }));
}

/**
 * The effects a wake's engine events make, under the *Effects* setting in force (design §13.2,
 * Effects):
 *
 * - a line clear flashes its rows and bursts into particles of their cells' colours, bigger for more
 *   lines, bigger again for a T-spin, a back-to-back or a perfect clear, and growing with the combo
 *   (a T-spin that clears nothing bursts from its piece); 2 or more lines shake the board;
 * - a hard drop leaves a trail and nudges the board down;
 * - a lock brightens the locked cells, a level-up pulses the border and a top-out fades the stack.
 *
 * *Reduced* leaves out the shake, the nudge and the trails, and *Off* everything. A back-to-back
 * needs the status before each lock: `backToBackBefore` gives it (a client-core
 * `BackToBackTracker`'s `next`), and is called once for each lock, in order, whatever the setting,
 * so the status stays right while effects are off. It only describes the effects: they never touch
 * the game.
 */
export function effectsForEvents(
  events: readonly EngineEvent[],
  setting: Effects,
  backToBackBefore: (lock: LockEvent) => boolean,
): Effect[] {
  const effects: Effect[] = [];
  const first = events[0]?.frame ?? 0;
  /** The rows of the hard drop whose lock comes next. */
  let dropped: number | null = null;
  for (const event of events) {
    const delay = framesToMs(event.frame - first);
    if (event.type === 'hardDrop') {
      dropped = event.rows;
      effects.push({ type: 'nudge', distance: NUDGE, delay });
    } else if (event.type === 'lock') {
      const { kind, cells } = event.piece;
      if (dropped !== null && dropped > 0) {
        effects.push({ type: 'trail', kind, cells, rows: dropped, delay });
      }
      dropped = null;
      const chained = isBackToBack(event, backToBackBefore(event));
      const glowing = cellsAfterClearing(event);
      if (glowing.length > 0) effects.push({ type: 'glow', kind, cells: glowing, delay });
      if (event.clearedRows.length > 0) {
        effects.push({ type: 'flash', rows: event.clearedRows.map(({ row }) => row), delay });
      }
      const burst = burstOf(event, chained, delay);
      if (burst) effects.push(burst);
      const strength = SHAKE_BY_LINES[event.clear.lines];
      if (strength > 0) effects.push({ type: 'shake', strength, delay });
    } else if (event.type === 'levelUp') {
      effects.push({ type: 'pulse', delay });
    } else if (event.type === 'topOut') {
      effects.push({ type: 'fade', delay });
    }
  }
  if (setting === 'off') return [];
  return setting === 'full' ? effects : effects.filter((effect) => !MOVING.has(effect.type));
}
