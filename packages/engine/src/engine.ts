import { assertInteger } from './assert';
import { applyMarginTime, calculateAttack } from './attack';
import {
  BOARD_WIDTH,
  type Board,
  clearLines,
  collides,
  createBoard,
  insertGarbage,
  isEmpty,
  lockPiece,
  VISIBLE_ROWS,
} from './board';
import { cancelGarbage, type GarbageEntry, holeColumn } from './garbage';
import { hashText } from './hash';
import { type ModeSettings, SUBROWS_PER_ROW } from './modes';
import { type ActivePiece, bottomRow, moved, type PieceKind } from './pieces';
import { type SevenBagState, sevenBag } from './random';
import { srs, turned } from './rotation';
import { HARD_DROP_POINTS, type LockClear, SOFT_DROP_POINTS, scoreLock } from './scoring';
import { detectTSpin, type Turn } from './t-spin';

/** Pieces spawn with the top row of their box in row 22 in design numbering. */
const SPAWN_ROW = 21;

/** An atomic engine instruction at a frame (design §7.1, ADR 0002). */
export type Action = PieceAction | GarbageAcceptedAction;

/** An action the player makes with the active piece. */
export interface PieceAction {
  frame: number;
  type: PieceActionType;
}

/**
 * `garbageAccepted{id}`: the lock that clears nothing at this frame lands the attack `id`, the
 * oldest in the garbage meter, as far as the lock's garbage cap allows (design §8.5).
 */
export interface GarbageAcceptedAction {
  frame: number;
  type: ActionType.GarbageAccepted;
  id: number;
}

/** The kinds of action. The values are the action names on the wire and in recorded matches. */
export enum ActionType {
  MoveLeft = 'moveLeft',
  MoveRight = 'moveRight',
  RotateCW = 'rotateCW',
  RotateCCW = 'rotateCCW',
  Rotate180 = 'rotate180',
  SoftDrop = 'softDrop',
  HardDrop = 'hardDrop',
  Hold = 'hold',
  GarbageAccepted = 'garbageAccepted',
}

/** The kinds of action the player makes with the active piece. */
export type PieceActionType = Exclude<ActionType, ActionType.GarbageAccepted>;

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
  /** The turn that last moved the active piece, or `null` if its last move wasn't a turn. */
  lastTurn: Turn | null;
  toppedOut: boolean;
  /**
   * Whether the game met the mode's end condition (design §4): its line goal or frame limit. Like a
   * top-out, it stops the game, and the frame stays where it ended.
   */
  finished: boolean;
  /** The level that multiplies line clear points (design §3). */
  level: number;
  score: number;
  linesCleared: number;
  /** Pieces locked, including one that locked out. */
  piecesPlaced: number;
  /**
   * The guideline combo counter: one less than the number of locks in a row that cleared lines, so
   * -1 after a lock that cleared none and 0 after the first clear.
   */
  combo: number;
  /** Whether the last line clear was a difficult clear, so the next one scores back-to-back. */
  backToBack: boolean;
  /** Incoming garbage that hasn't landed yet, oldest first (design §8.5). */
  garbageMeter: GarbageEntry[];
}

/** The lines of garbage a lock sends, after margin time and before cancellation, and its frame. */
export interface Attack {
  frame: number;
  lines: number;
}

/** What happened in a `step` that the server or client needs to act on. */
export interface StepResult {
  /** The attack of each lock that sent one, in order. */
  attacks: Attack[];
  /**
   * With `acceptGarbage`, the `garbageAccepted` actions for the garbage that landed, in order, for
   * the client to add to its action stream. Without it, empty.
   */
  accepted: GarbageAcceptedAction[];
}

export interface StepOptions {
  /**
   * Land garbage from the meter at every lock that clears nothing, as the player's own client does,
   * and report it in `accepted`. Without it, as on the server, garbage lands only where the
   * actions' `garbageAccepted` say.
   */
  acceptGarbage?: boolean;
}

/** What a `step` carries through its frames to each lock. */
interface Stepping {
  out: StepResult;
  acceptGarbage: boolean;
  /** The current frame's `garbageAccepted` ids its locks have yet to land, in order. */
  toLand: number[];
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
   * must be in frame order, after the current frame and no later than `frame`. Once the game is over,
   * by a top-out or the mode's end condition, the engine stops: `step` changes nothing and the frame
   * stays where the game ended.
   *
   * A frame's `garbageAccepted` actions don't act where they stand: they name the garbage that the
   * frame's locks that clear nothing land, in order (design §8.5). If any is left over at the end of
   * a frame the game is still on in, or names garbage that isn't the oldest in the meter, `step`
   * throws and changes nothing.
   */
  step(
    frame: number,
    actions: readonly Action[],
    { acceptGarbage = false }: StepOptions = {},
  ): StepResult {
    assertInteger('step frame', frame, this.#state.frame);
    let previous = this.#state.frame + 1;
    for (const action of actions) {
      assertInteger('action frame', action.frame, previous, frame);
      previous = action.frame;
      if (action.type === ActionType.GarbageAccepted) {
        if (acceptGarbage) {
          throw new RangeError('a step that accepts garbage records garbageAccepted itself');
        }
        assertInteger('garbageAccepted id', action.id, 0);
      }
    }

    // Steps a copy, so that a step that throws changes nothing.
    const s = cloneState(this.#state);
    const stepping: Stepping = { out: { attacks: [], accepted: [] }, acceptGarbage, toLand: [] };
    let i = 0;
    while (s.frame < frame && !isOver(s)) {
      s.frame++;
      const end = endOfFrame(actions, i, s.frame);
      stepping.toLand = actions
        .slice(i, end)
        .flatMap((action) => (action.type === ActionType.GarbageAccepted ? [action.id] : []));
      countLockFrame(s);
      for (; i < end && !isOver(s); i++) {
        const { type } = actions[i] as Action;
        if (type !== ActionType.GarbageAccepted) applyAction(s, stepping, type);
      }
      i = end;
      // A hard drop can end the game mid-frame, and it stops there.
      if (!isOver(s)) applyGravity(s, stepping);
      if (!isOver(s) && stepping.toLand.length > 0) {
        throw new RangeError(
          `garbageAccepted{${stepping.toLand[0]}} at frame ${s.frame} has no lock that clears nothing left to land at`,
        );
      }
      if (!isOver(s) && reachedFrameLimit(s)) s.finished = true;
    }
    this.#state = s;
    return stepping.out;
  }

  /**
   * Adds an attack to the end of the garbage meter: the server's `garbageQueued` (design §8.5). Its
   * id must not already be in the meter, it must have lines, and its hole seed must be a 32-bit
   * unsigned integer.
   */
  queueGarbage(entry: Readonly<GarbageEntry>): void {
    const meter = this.#state.garbageMeter;
    assertInteger('garbage id', entry.id, 0);
    if (meter.some(({ id }) => id === entry.id)) {
      throw new RangeError(`garbage ${entry.id} is already in the meter`);
    }
    assertInteger('garbage lines', entry.lines, 1);
    assertInteger('holeSeed', entry.holeSeed, 0, 0xffffffff);
    meter.push({ id: entry.id, lines: entry.lines, holeSeed: entry.holeSeed });
  }

  /**
   * Cancels `attack` lines against the garbage meter, oldest entry first (design §3), and returns
   * the remainder to send on.
   */
  cancelGarbage(attack: number): number {
    const { meter, remainder } = cancelGarbage(this.#state.garbageMeter, attack);
    this.#state.garbageMeter = meter;
    return remainder;
  }
}

export type { Engine };

/** A new game. */
export function createEngine(
  settings: Readonly<ModeSettings>,
  seed: number,
  playerIndex: number,
): Engine {
  assertModeSettings(settings);
  assertInteger('playerIndex', playerIndex, 0);
  const randomizer = sevenBag.create(seed);
  const first = sevenBag.next(randomizer);
  const queue = Array.from({ length: settings.previewSize }, () => sevenBag.next(randomizer));
  const state: EngineState = {
    settings,
    playerIndex,
    frame: 0,
    board: createBoard(),
    // `spawn` sets the active piece and its gravity and lock delay.
    active: atSpawn(first),
    hold: null,
    holdUsed: false,
    queue,
    randomizer,
    gravityCounter: 0,
    lockTimer: 0,
    lockResets: 0,
    lowestRow: 0,
    lastTurn: null,
    toppedOut: false,
    finished: false,
    level: 1,
    score: 0,
    linesCleared: 0,
    piecesPlaced: 0,
    combo: -1,
    backToBack: false,
    garbageMeter: [],
  };
  spawn(state, first);
  return new Engine(state);
}

/** Throws a RangeError unless every mode setting is a whole number in its range. */
function assertModeSettings(settings: Readonly<ModeSettings>): void {
  if (settings.gravity.length === 0) throw new RangeError('gravity must have at least one level');
  for (const gravity of settings.gravity) assertInteger('gravity', gravity, 1);
  if (settings.gravityStep !== null) assertInteger('gravityStep', settings.gravityStep, 1);
  if (settings.linesPerLevel !== null) {
    assertInteger('linesPerLevel', settings.linesPerLevel, 1);
  }
  if (settings.lineGoal !== null) assertInteger('lineGoal', settings.lineGoal, 1);
  if (settings.frameLimit !== null) assertInteger('frameLimit', settings.frameLimit, 1);
  assertInteger('lockDelay', settings.lockDelay, 1);
  assertInteger('maxLockResets', settings.maxLockResets, 0);
  assertInteger('previewSize', settings.previewSize, 0);
  assertInteger('garbageCap', settings.garbageCap, 1);
  if (settings.marginTimeStart !== null) {
    assertInteger('marginTimeStart', settings.marginTimeStart, 1);
  }
  assertInteger('marginTimeStep', settings.marginTimeStep, 1);
}

/** An engine continuing from `state`, which is copied. */
export function restoreEngine(state: EngineState): Engine {
  return new Engine(state);
}

// The rules: plain functions over the state, which only an `Engine` calls with its own.

/** Whether the game has ended, by a top-out or the mode's end condition. */
function isOver(s: EngineState): boolean {
  return s.toppedOut || s.finished;
}

/** Whether the game has run for the mode's whole time limit, if it has one. */
function reachedFrameLimit({ frame, settings: { frameLimit } }: EngineState): boolean {
  return frameLimit !== null && frame >= frameLimit;
}

/** Whether the player has cleared the mode's line goal, if it has one. */
function reachedLineGoal({ linesCleared, settings: { lineGoal } }: EngineState): boolean {
  return lineGoal !== null && linesCleared >= lineGoal;
}

function applyAction(s: EngineState, stepping: Stepping, type: PieceActionType): void {
  switch (type) {
    case ActionType.MoveLeft:
      tryMove(s, -1, 0);
      break;
    case ActionType.MoveRight:
      tryMove(s, 1, 0);
      break;
    case ActionType.RotateCW:
      rotate(s, 1);
      break;
    case ActionType.RotateCCW:
      rotate(s, 3);
      break;
    case ActionType.Rotate180:
      rotate(s, 2);
      break;
    case ActionType.SoftDrop:
      if (tryMove(s, 0, -1)) s.score += SOFT_DROP_POINTS;
      break;
    case ActionType.HardDrop:
      while (tryMove(s, 0, -1)) s.score += HARD_DROP_POINTS;
      lock(s, stepping);
      break;
    case ActionType.Hold:
      hold(s);
      break;
  }
}

/** A frame that begins with the active piece on the stack counts towards its lock delay. */
function countLockFrame(s: EngineState): void {
  if (onStack(s)) s.lockTimer++;
}

/**
 * A piece in the air falls by the gravity built up. A piece on the stack builds up no gravity, and
 * locks at the end of the `lockDelay`th frame after the one it landed or restarted its lock delay
 * in.
 */
function applyGravity(s: EngineState, stepping: Stepping): void {
  if (onStack(s)) {
    s.gravityCounter = 0;
    if (s.lockTimer >= s.settings.lockDelay) lock(s, stepping);
    return;
  }
  s.gravityCounter += gravityAt(s);
  while (s.gravityCounter >= SUBROWS_PER_ROW) {
    s.gravityCounter -= SUBROWS_PER_ROW;
    if (!tryMove(s, 0, -1)) {
      s.gravityCounter = 0;
      break;
    }
  }
}

/**
 * Turns the active piece clockwise by `quarterTurns`, placing it at the first of the rotation
 * system's kicks where it fits, and records the turn for T-spin detection. If none fits, it doesn't
 * turn.
 */
function rotate(s: EngineState, quarterTurns: 1 | 2 | 3): void {
  const { kind, col, row, rotation } = s.active;
  const to = turned(rotation, quarterTurns);
  for (const kick of srs.kicks(kind, rotation, to)) {
    const [cols, rows] = kick;
    if (tryPlace(s, { kind, col: col + cols, row: row + rows, rotation: to })) {
      s.lastTurn = { quarterTurns, kick };
      return;
    }
  }
}

/**
 * The gravity of the current level, or of the level cap above it. With a gravity curve that follows
 * time, the gravity of the current frame's step, or of the last step after it.
 */
function gravityAt({ settings: { gravity, gravityStep }, level, frame }: EngineState): number {
  // Both whole numbers, so the quotient floors exactly.
  const index = gravityStep === null ? level - 1 : Math.floor(frame / gravityStep);
  // `createEngine` ensures at least one level.
  return gravity[Math.min(index, gravity.length - 1)] as number;
}

function restartLockDelay(s: EngineState): void {
  if (s.lockResets >= s.settings.maxLockResets) return;
  s.lockResets++;
  s.lockTimer = 0;
}

/** Gives the active piece a fresh lock delay, with all its restarts, from its current row. */
function freshLockDelay(s: EngineState): void {
  s.lowestRow = bottomRow(s.active);
  s.lockTimer = 0;
  s.lockResets = 0;
}

/** Whether the active piece is resting on the stack or the floor. */
function onStack(s: EngineState): boolean {
  return !canMove(s, 0, -1);
}

function canMove(s: EngineState, cols: number, rows: number): boolean {
  return !collides(s.board, moved(s.active, cols, rows));
}

function tryMove(s: EngineState, cols: number, rows: number): boolean {
  return tryPlace(s, moved(s.active, cols, rows));
}

/**
 * Makes `piece` the active piece if it fits: moved, turned or dropped (design §3). It has no last
 * turn until `rotate` records one. Reaching a new lowest row gives the piece a fresh lock delay.
 * Otherwise, a piece that was on the stack restarts its lock delay while it has restarts left, and
 * a piece in the air uses none.
 */
function tryPlace(s: EngineState, piece: ActivePiece): boolean {
  if (collides(s.board, piece)) return false;
  const wasOnStack = onStack(s);
  s.active = piece;
  s.lastTurn = null;
  if (bottomRow(piece) < s.lowestRow) freshLockDelay(s);
  else if (wasOnStack) restartLockDelay(s);
  return true;
}

/**
 * Locks the active piece, clears and scores lines and T-spins, reports its attack, lands garbage if
 * it cleared nothing, and spawns the next piece from the queue. A piece that locks entirely above
 * the visible rows locks out: the player tops out and the game stops there, with that piece left
 * active. Garbage that overflows the board tops the player out too, before the next piece spawns.
 */
function lock(s: EngineState, stepping: Stepping): void {
  const tSpin = detectTSpin(s.board, s.active, s.lastTurn);
  lockPiece(s.board, s.active);
  s.piecesPlaced++;
  if (bottomRow(s.active) >= VISIBLE_ROWS) {
    s.toppedOut = true;
    return;
  }
  const lines = clearLines(s.board);
  s.linesCleared += lines;
  const clear: LockClear = { lines, tSpin, perfectClear: isEmpty(s.board) };
  // Before scoring, which moves the chain on past this lock.
  const attack = applyMarginTime(calculateAttack(s, clear), s.frame, s.settings);
  if (attack > 0) stepping.out.attacks.push({ frame: s.frame, lines: attack });
  scoreLock(s, clear);
  levelUp(s);
  s.holdUsed = false;
  if (reachedLineGoal(s)) {
    s.finished = true;
    return;
  }
  if (lines === 0) landGarbage(s, stepping);
  if (s.toppedOut) return;
  spawn(s, nextFromQueue(s));
}

/**
 * Lands garbage at a lock that cleared nothing (design §3, §8.5): the oldest attacks in the meter,
 * up to the mode's garbage cap, splitting an attack the cap cuts short. Accepting garbage, it lands
 * what the meter holds and records a `garbageAccepted` for each attack it lands lines of. Otherwise
 * it lands the attacks the frame's `garbageAccepted` name, in order. Garbage that pushes the stack
 * past the top of the board tops the player out.
 */
function landGarbage(s: EngineState, stepping: Stepping): void {
  let room = s.settings.garbageCap;
  while (room > 0 && !s.toppedOut) {
    const entry = s.garbageMeter[0];
    if (stepping.acceptGarbage) {
      if (!entry) return;
      stepping.out.accepted.push({
        frame: s.frame,
        type: ActionType.GarbageAccepted,
        id: entry.id,
      });
    } else {
      const id = stepping.toLand.shift();
      if (id === undefined) return;
      if (entry?.id !== id) {
        throw new RangeError(
          `garbageAccepted{${id}} at frame ${s.frame} isn't the oldest garbage in the meter`,
        );
      }
    }
    const lines = Math.min(room, entry.lines);
    room -= lines;
    entry.lines -= lines;
    if (entry.lines === 0) s.garbageMeter.shift();
    if (insertGarbage(s.board, lines, holeColumn(entry.holeSeed))) s.toppedOut = true;
  }
}

/** The index after the last of `actions` at `frame`, from `start`. */
function endOfFrame(actions: readonly Action[], start: number, frame: number): number {
  let end = start;
  while (actions[end]?.frame === frame) end++;
  return end;
}

/**
 * Raises the level by one for each `linesPerLevel` lines cleared, up to the level cap, unless the
 * mode keeps it at 1. It runs after scoring, so a clear scores at the level it was made at.
 */
function levelUp(s: EngineState): void {
  const { gravity, linesPerLevel } = s.settings;
  if (linesPerLevel === null) return;
  while (s.level < gravity.length && s.linesCleared >= s.level * linesPerLevel) s.level++;
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
  // The queue always holds `previewSize` pieces before the push, so it can't be empty here.
  return s.queue.shift() as PieceKind;
}

/** Brings in a new active piece: it blocks out on the stack, or else drops a row at once. */
function spawn(s: EngineState, kind: PieceKind): void {
  s.active = atSpawn(kind);
  s.lastTurn = null;
  s.gravityCounter = 0;
  freshLockDelay(s);
  if (collides(s.board, s.active)) s.toppedOut = true;
  else tryMove(s, 0, -1);
}

/** A new piece, centred in the board's columns and rounded left (design §3). */
function atSpawn(kind: PieceKind): ActivePiece {
  // Every piece's box is as wide as its cells in rotation state 0.
  const width = srs.cellOffsets(kind, 0).reduce((widest, [col]) => Math.max(widest, col + 1), 0);
  return { kind, col: (BOARD_WIDTH - width) >> 1, row: SPAWN_ROW, rotation: 0 };
}

/**
 * A deep copy of `state` with every object's fields in one fixed order, whatever order the input
 * had, so the JSON of any state the engine holds is canonical. Each field is listed by name: a new
 * state field left out of here is a type error, and unknown input fields are dropped.
 */
function cloneState(state: EngineState): EngineState {
  const { settings, active, lastTurn, randomizer } = state;
  return {
    settings: {
      gravity: [...settings.gravity],
      gravityStep: settings.gravityStep,
      linesPerLevel: settings.linesPerLevel,
      lineGoal: settings.lineGoal,
      frameLimit: settings.frameLimit,
      lockDelay: settings.lockDelay,
      maxLockResets: settings.maxLockResets,
      previewSize: settings.previewSize,
      garbageCap: settings.garbageCap,
      marginTimeStart: settings.marginTimeStart,
      marginTimeStep: settings.marginTimeStep,
    },
    playerIndex: state.playerIndex,
    frame: state.frame,
    board: state.board.map((row) => [...row]),
    active: { kind: active.kind, col: active.col, row: active.row, rotation: active.rotation },
    hold: state.hold,
    holdUsed: state.holdUsed,
    queue: [...state.queue],
    randomizer: { rng: randomizer.rng, bag: [...randomizer.bag] },
    gravityCounter: state.gravityCounter,
    lockTimer: state.lockTimer,
    lockResets: state.lockResets,
    lowestRow: state.lowestRow,
    lastTurn: lastTurn && {
      quarterTurns: lastTurn.quarterTurns,
      kick: [lastTurn.kick[0], lastTurn.kick[1]],
    },
    toppedOut: state.toppedOut,
    finished: state.finished,
    level: state.level,
    score: state.score,
    linesCleared: state.linesCleared,
    piecesPlaced: state.piecesPlaced,
    combo: state.combo,
    backToBack: state.backToBack,
    garbageMeter: state.garbageMeter.map(({ id, lines, holeSeed }) => ({ id, lines, holeSeed })),
  };
}
