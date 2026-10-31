import type { BoardCell } from './board';
import type { Cell, PieceKind } from './pieces';
import type { LockClear } from './scoring';

/**
 * Something that happened during an engine step, at its frame (design §5.2), for clients to drive
 * sound, effects and callouts. Events are output only: they are never part of the engine state,
 * `serialize` or `hash`.
 */
export type EngineEvent =
  | LockEvent
  | HoldEvent
  | TurnEvent
  | TurnFailedEvent
  | HardDropEvent
  | GarbageLandedEvent
  | LevelUpEvent
  | TopOutEvent
  | FinishEvent;

/** The kinds of engine event. */
export type EngineEventType = EngineEvent['type'];

/** A piece locked. A piece that locks out clears nothing and scores nothing. */
export interface LockEvent {
  type: 'lock';
  frame: number;
  /** What the lock cleared: lines, T-spin and perfect clear. */
  clear: LockClear;
  /** The combo counter after the lock: -1 if it cleared nothing, 0 for the first clear in a row. */
  combo: number;
  /** The back-to-back status after the lock. */
  backToBack: boolean;
  /** The piece that locked, and the four board cells it locked in. */
  piece: LockedPiece;
  /**
   * The rows the lock cleared, bottom row first, as they were on the board just before they
   * cleared, with the locked piece in them. The engine has removed them by the time a client sees
   * the state.
   */
  clearedRows: ClearedRow[];
}

/** A piece as it locked: its kind, and the board cells it covers. */
export interface LockedPiece {
  kind: PieceKind;
  cells: Cell[];
}

/** A row a lock cleared: its board index (0 is the bottom row) and its cells before clearing. */
export interface ClearedRow {
  row: number;
  cells: BoardCell[];
}

/** The active piece went into the hold slot. */
export interface HoldEvent {
  type: 'hold';
  frame: number;
}

/** The active piece turned, in place or by a kick. */
export interface TurnEvent {
  type: 'turn';
  frame: number;
  /** Whether it took a kick, rather than turning in place. */
  kicked: boolean;
}

/** A turn found no kick that fit, so the piece didn't turn. */
export interface TurnFailedEvent {
  type: 'turnFailed';
  frame: number;
}

/** A hard drop, before the lock it makes. */
export interface HardDropEvent {
  type: 'hardDrop';
  frame: number;
  /** How many rows the piece dropped. */
  rows: number;
}

/** Garbage landed at a lock that cleared nothing. */
export interface GarbageLandedEvent {
  type: 'garbageLanded';
  frame: number;
  /** How many garbage lines landed at the lock, from every attack it landed. */
  lines: number;
}

/** A lock raised the level. */
export interface LevelUpEvent {
  type: 'levelUp';
  frame: number;
  /** The new level. */
  level: number;
}

/** The player topped out: a block out, a lock out or a garbage overflow. The game is over. */
export interface TopOutEvent {
  type: 'topOut';
  frame: number;
}

/** The game met the mode's end condition: its line goal or frame limit. The game is over. */
export interface FinishEvent {
  type: 'finish';
  frame: number;
}
