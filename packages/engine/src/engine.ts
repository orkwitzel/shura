import { assertInteger } from './assert';
import { type Board, clearLines, collides, createBoard, lockPiece, VISIBLE_ROWS } from './board';
import { hashText } from './hash';
import { type ActivePiece, type PieceKind, pieceCells } from './pieces';
import { type SevenBagState, sevenBag } from './random';

/** Gravity counts in sub-rows: 60 × 2^16 per row, so any whole number of rows per second is exact. */
export const SUBROWS_PER_ROW = 3_932_160;

/** The rule values a mode fixes (design §3, §4). */
export interface ModeSettings {
  /** Sub-rows the active piece falls per frame. */
  gravity: number;
}

/** Fixed gravity of 1 row per second. */
export const DEFAULT_MODE_SETTINGS: Readonly<ModeSettings> = { gravity: 65_536 };

export const PREVIEW_SIZE = 5;

/** Frames a piece can rest on the stack before it locks (design §3). */
export const LOCK_DELAY = 30;
/** How many times moving or rotating on the stack can restart one piece's lock delay (design §3). */
export const MAX_LOCK_RESETS = 15;

/** Pieces spawn with their origin here: rows 21–22 in design numbering. */
const SPAWN_COL = 4;
const SPAWN_ROW = 20;

/** An atomic engine instruction at a frame (design §7.1, ADR 0002). */
export interface Action {
  frame: number;
  type: ActionType;
}

export type ActionType = 'moveLeft' | 'moveRight' | 'softDrop' | 'hardDrop' | 'hold';

/** The engine's full state, as plain data. */
export interface EngineState {
  settings: ModeSettings;
  playerIndex: number;
  /** The last frame simulated. */
  frame: number;
  board: Board;
  /**
   * The piece under the player's control. After a block out, the piece that could not spawn; after
   * a lock out, the piece that locked.
   */
  active: ActivePiece;
  /** The piece in the hold slot, if any. */
  hold: PieceKind | null;
  /** Whether hold has been used since the last lock. It works once per piece. */
  holdUsed: boolean;
  /** The next pieces, nearest first. */
  queue: PieceKind[];
  randomizer: SevenBagState;
  /** Sub-rows of gravity built up towards the active piece's next one-row fall. */
  gravityCounter: number;
  /**
   * Frames that began with the active piece on the stack, since it landed or its lock delay
   * restarted.
   */
  lockTimer: number;
  /** How many times the active piece's lock delay has restarted. */
  lockResets: number;
  /** The lowest board row any cell of the active piece has reached. */
  lowestRow: number;
  toppedOut: boolean;
}

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/** `engine.state`: the live state, typed so callers can't change it. */
export type ReadonlyEngineState = DeepReadonly<EngineState>;

/** One player's game. Make one with `createEngine` or `restoreEngine`; the class isn't exported. */
class Engine {
  #state: EngineState;

  constructor(state: EngineState) {
    this.#state = cloneState(state);
  }

  get state(): ReadonlyEngineState {
    return this.#state;
  }

  /** A copy of the full state, as plain data. */
  serialize(): EngineState {
    return cloneState(this.#state);
  }

  /** A stable hash of the full state. `cloneState` fixes the key order, so the JSON is canonical. */
  hash(): string {
    return hashText(JSON.stringify(this.#state));
  }

  /**
   * Advances to `frame`. Each frame applies that frame's actions in order, then gravity. Actions
   * must be in frame order, after the current frame and no later than `frame`. Once the player has
   * topped out, the engine stops: `step` changes nothing and the frame stays at the top-out.
   */
  step(frame: number, actions: readonly Action[]): void {
    const s = this.#state;
    assertInteger('step frame', frame, s.frame);
    let previous = s.frame + 1;
    for (const action of actions) {
      assertInteger('action frame', action.frame, previous, frame);
      previous = action.frame;
    }

    let i = 0;
    while (s.frame < frame && !s.toppedOut) {
      s.frame++;
      if (onStack(s)) s.lockTimer++;
      for (
        let action = actions[i];
        action?.frame === s.frame && !s.toppedOut;
        action = actions[++i]
      ) {
        applyAction(s, action.type);
      }
      // A hard drop can top out mid-frame, and the game stops there.
      if (!s.toppedOut) applyGravity(s);
    }
  }
}

export type { Engine };

/** A new game. */
export function createEngine(settings: ModeSettings, seed: number, playerIndex: number): Engine {
  assertInteger('gravity', settings.gravity, 1);
  assertInteger('playerIndex', playerIndex, 0);
  const randomizer = sevenBag.create(seed);
  const first = sevenBag.next(randomizer);
  const queue = Array.from({ length: PREVIEW_SIZE }, () => sevenBag.next(randomizer));
  const state: EngineState = {
    settings,
    playerIndex,
    frame: 0,
    board: createBoard(),
    active: atSpawn(first),
    hold: null,
    holdUsed: false,
    queue,
    randomizer,
    gravityCounter: 0,
    lockTimer: 0,
    lockResets: 0,
    lowestRow: 0,
    toppedOut: false,
  };
  spawn(state, first);
  return new Engine(state);
}

/** An engine continuing from `state`, which is copied. */
export function restoreEngine(state: EngineState): Engine {
  return new Engine(state);
}

// The rules: plain functions over the state, which only an `Engine` calls with its own.

function applyAction(s: EngineState, type: ActionType): void {
  switch (type) {
    case 'moveLeft':
      shift(s, -1);
      break;
    case 'moveRight':
      shift(s, 1);
      break;
    case 'softDrop':
      tryMove(s, 0, -1);
      break;
    case 'hardDrop':
      while (tryMove(s, 0, -1));
      lock(s);
      break;
    case 'hold':
      hold(s);
      break;
  }
}

/**
 * A piece in the air falls by the gravity built up. A piece on the stack builds up no gravity, and
 * locks at the end of the `LOCK_DELAY`th frame after the one it landed or restarted its lock delay
 * in.
 */
function applyGravity(s: EngineState): void {
  if (onStack(s)) {
    if (s.lockTimer >= LOCK_DELAY) lock(s);
    return;
  }
  s.gravityCounter += s.settings.gravity;
  while (s.gravityCounter >= SUBROWS_PER_ROW) {
    s.gravityCounter -= SUBROWS_PER_ROW;
    if (!tryMove(s, 0, -1)) {
      s.gravityCounter = 0;
      break;
    }
  }
}

/**
 * Moves the active piece sideways. A successful move from on the stack restarts the lock delay,
 * while the piece has restarts left. Moves in the air use none.
 */
function shift(s: EngineState, cols: number): void {
  const wasOnStack = onStack(s);
  if (!tryMove(s, cols, 0) || !wasOnStack || s.lockResets >= MAX_LOCK_RESETS) return;
  s.lockResets++;
  s.lockTimer = 0;
}

/** Whether the active piece is resting on the stack or the floor. */
function onStack(s: EngineState): boolean {
  return !canMove(s, 0, -1);
}

function canMove(s: EngineState, cols: number, rows: number): boolean {
  return !collides(s.board, moved(s.active, cols, rows));
}

/**
 * Moves the active piece if it fits. Reaching a new lowest row gives the piece a fresh lock delay
 * and all its resets back (design §3).
 */
function tryMove(s: EngineState, cols: number, rows: number): boolean {
  if (!canMove(s, cols, rows)) return false;
  s.active = moved(s.active, cols, rows);
  const bottom = bottomRow(s.active);
  if (bottom < s.lowestRow) {
    s.lowestRow = bottom;
    s.lockTimer = 0;
    s.lockResets = 0;
  }
  return true;
}

/**
 * Locks the active piece, clears lines and spawns the next piece from the queue. A piece that locks
 * entirely above the visible rows locks out: the player tops out and the game stops there, with
 * that piece left active.
 */
function lock(s: EngineState): void {
  lockPiece(s.board, s.active);
  if (bottomRow(s.active) >= VISIBLE_ROWS) {
    s.toppedOut = true;
    return;
  }
  clearLines(s.board);
  s.holdUsed = false;
  spawn(s, nextFromQueue(s));
}

/**
 * Puts the active piece in the hold slot and spawns the piece that was there, or the next one from
 * the queue if the slot was empty. Once per piece: it does nothing again until the next lock.
 */
function hold(s: EngineState): void {
  if (s.holdUsed) return;
  const held = s.hold;
  s.hold = s.active.kind;
  s.holdUsed = true;
  spawn(s, held ?? nextFromQueue(s));
}

/** Takes the nearest piece from the queue and refills it from the randomizer. */
function nextFromQueue(s: EngineState): PieceKind {
  s.queue.push(sevenBag.next(s.randomizer));
  // The queue always holds PREVIEW_SIZE pieces before the push, so it can't be empty here.
  return s.queue.shift() as PieceKind;
}

/** Brings in a new active piece: it blocks out on the stack, or else drops a row at once. */
function spawn(s: EngineState, kind: PieceKind): void {
  s.active = atSpawn(kind);
  s.gravityCounter = 0;
  s.lockTimer = 0;
  s.lockResets = 0;
  s.lowestRow = bottomRow(s.active);
  if (collides(s.board, s.active)) s.toppedOut = true;
  else tryMove(s, 0, -1);
}

function atSpawn(kind: PieceKind): ActivePiece {
  return { kind, col: SPAWN_COL, row: SPAWN_ROW };
}

/**
 * A deep copy of `state` with every object's fields in one fixed order, whatever order the input
 * had, so the JSON of any state the engine holds is canonical. Each field is listed by name: a new
 * state field left out of here is a type error, and unknown input fields are dropped.
 */
function cloneState(state: EngineState): EngineState {
  const { settings, active, randomizer } = state;
  return {
    settings: { gravity: settings.gravity },
    playerIndex: state.playerIndex,
    frame: state.frame,
    board: state.board.map((row) => [...row]),
    active: { kind: active.kind, col: active.col, row: active.row },
    hold: state.hold,
    holdUsed: state.holdUsed,
    queue: [...state.queue],
    randomizer: { rng: randomizer.rng, bag: [...randomizer.bag] },
    gravityCounter: state.gravityCounter,
    lockTimer: state.lockTimer,
    lockResets: state.lockResets,
    lowestRow: state.lowestRow,
    toppedOut: state.toppedOut,
  };
}

function bottomRow(piece: ActivePiece): number {
  return Math.min(...pieceCells(piece).map((cell) => cell.row));
}

function moved(piece: ActivePiece, cols: number, rows: number): ActivePiece {
  return { ...piece, col: piece.col + cols, row: piece.row + rows };
}
