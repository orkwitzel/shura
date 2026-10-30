import { assertInteger } from './assert';
import { type Board, clearLines, collides, createBoard, lockPiece } from './board';
import { hashText } from './hash';
import type { ActivePiece, PieceKind } from './pieces';
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

/** Pieces spawn with their origin here: rows 21–22 in design numbering. */
const SPAWN_COL = 4;
const SPAWN_ROW = 20;

/** An atomic engine instruction at a frame (design §7.1, ADR 0002). */
export interface Action {
  frame: number;
  type: ActionType;
}

export type ActionType = 'moveLeft' | 'moveRight' | 'hardDrop';

/** The engine's full state, as plain data. */
export interface EngineState {
  settings: ModeSettings;
  playerIndex: number;
  /** The last frame simulated. */
  frame: number;
  board: Board;
  /** The piece under the player's control. After a block out, the piece that could not spawn. */
  active: ActivePiece;
  /** The next pieces, nearest first. */
  queue: PieceKind[];
  randomizer: SevenBagState;
  /** Sub-rows of gravity built up towards the active piece's next one-row fall. */
  gravityCounter: number;
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
  const active = atSpawn(sevenBag.next(randomizer));
  const queue = Array.from({ length: PREVIEW_SIZE }, () => sevenBag.next(randomizer));
  const state: EngineState = {
    settings,
    playerIndex,
    frame: 0,
    board: createBoard(),
    active,
    queue,
    randomizer,
    gravityCounter: 0,
    toppedOut: false,
  };
  enter(state);
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
      tryMove(s, -1, 0);
      break;
    case 'moveRight':
      tryMove(s, 1, 0);
      break;
    case 'hardDrop':
      while (tryMove(s, 0, -1));
      lock(s);
      break;
  }
}

function applyGravity(s: EngineState): void {
  s.gravityCounter += s.settings.gravity;
  while (s.gravityCounter >= SUBROWS_PER_ROW) {
    s.gravityCounter -= SUBROWS_PER_ROW;
    if (!tryMove(s, 0, -1)) break;
  }
  // Until lock delay arrives (#7), a piece locks as soon as it lands.
  if (!canMove(s, 0, -1)) lock(s);
}

function canMove(s: EngineState, cols: number, rows: number): boolean {
  return !collides(s.board, moved(s.active, cols, rows));
}

function tryMove(s: EngineState, cols: number, rows: number): boolean {
  if (!canMove(s, cols, rows)) return false;
  s.active = moved(s.active, cols, rows);
  return true;
}

/** Locks the active piece, clears lines and spawns the next piece from the queue. */
function lock(s: EngineState): void {
  lockPiece(s.board, s.active);
  clearLines(s.board);
  s.queue.push(sevenBag.next(s.randomizer));
  // The queue always holds PREVIEW_SIZE pieces before the push, so it can't be empty here.
  s.active = atSpawn(s.queue.shift() as PieceKind);
  s.gravityCounter = 0;
  enter(s);
}

/** The active piece has just spawned: it blocks out on the stack, or else drops a row at once. */
function enter(s: EngineState): void {
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
    queue: [...state.queue],
    randomizer: { rng: randomizer.rng, bag: [...randomizer.bag] },
    gravityCounter: state.gravityCounter,
    toppedOut: state.toppedOut,
  };
}

function moved(piece: ActivePiece, cols: number, rows: number): ActivePiece {
  return { ...piece, col: piece.col + cols, row: piece.row + rows };
}
