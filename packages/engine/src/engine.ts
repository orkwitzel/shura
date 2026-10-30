import { assertInteger } from './assert';
import { calculateAttack } from './attack';
import {
  BOARD_WIDTH,
  type Board,
  clearLines,
  collides,
  createBoard,
  isEmpty,
  lockPiece,
  VISIBLE_ROWS,
} from './board';
import { addToMeter, type GarbageEntry, type LastHole, landGarbage, sendAttack } from './garbage';
import { hashText } from './hash';
import { assertModeSettings, type ModeSettings, SUBROWS_PER_ROW } from './modes';
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
  /** The rules the game plays by, which never change. */
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
  /**
   * Quarter-lines of attack that margin time's rounding left over (0 to 3), which the next attack
   * adds before it is cancelled and sent (design §3).
   */
  marginCarry: number;
  /**
   * The id of the last attack that landed lines and the column of its hole, so the rest of an attack
   * the garbage cap cut short keeps its column, and the next attack's hole moves (design §3).
   * `null` until garbage first lands.
   */
  lastHole: LastHole | null;
}

/**
 * The garbage lines a lock sends on to an opponent, and its frame: its attack after margin time,
 * less what cancelled garbage in its own meter.
 */
export interface SentGarbage {
  frame: number;
  lines: number;
}

/** What happened in a `step` that the server or client needs to act on. */
export interface StepResult {
  /** The garbage each lock that sent any sent on, in order, for the server to queue on a target. */
  sent: SentGarbage[];
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

/**
 * What each lock in a `step` needs besides the state: where to report the garbage it sends and
 * lands, and which garbage it may land.
 */
interface LockContext {
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
    // Every state the engine holds from here on shares these settings, which nothing changes.
    this.#state = cloneState({ ...state, settings: frozenCopy(state.settings) });
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
    let landsAccepted = false;
    for (const action of actions) {
      assertInteger('action frame', action.frame, previous, frame);
      previous = action.frame;
      if (action.type === ActionType.GarbageAccepted) {
        if (acceptGarbage) {
          throw new RangeError('a step that accepts garbage records garbageAccepted itself');
        }
        assertInteger('garbageAccepted id', action.id, 0);
        landsAccepted = true;
      }
    }

    // Only a `garbageAccepted` can throw once the step is under way, so only then does it step a
    // copy, so that a step that throws changes nothing.
    const s = landsAccepted ? cloneState(this.#state) : this.#state;
    const context: LockContext = { out: { sent: [], accepted: [] }, acceptGarbage, toLand: [] };
    let next = 0;
    while (s.frame < frame && !isOver(s)) {
      s.frame++;
      const end = endOfFrame(actions, next, s.frame);
      playFrame(s, context, actions.slice(next, end));
      next = end;
    }
    this.#state = s;
    return context.out;
  }

  /**
   * Adds an attack to the end of the garbage meter: the server's `garbageQueued` (design §8.5). The
   * mode must have garbage, the id must not already be in the meter, the attack must have lines,
   * and its hole seed must be a 32-bit unsigned integer.
   */
  queueGarbage(entry: Readonly<GarbageEntry>): void {
    if (this.#state.settings.garbage === null) {
      throw new RangeError('a single-player mode has no garbage');
    }
    addToMeter(this.#state.garbageMeter, entry);
  }
}

export type { Engine };

/** A new game. */
export function createEngine(settings: ModeSettings, seed: number, playerIndex: number): Engine {
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
    marginCarry: 0,
    lastHole: null,
  };
  spawn(state, first);
  return new Engine(state);
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

/**
 * Plays the frame `s.frame` as `step` says: its piece actions in order, then gravity, then the
 * frame limit, with its `garbageAccepted` actions naming the garbage its locks land. A hard drop
 * can end the game mid-frame, and the frame stops there.
 */
function playFrame(s: EngineState, context: LockContext, actions: readonly Action[]): void {
  const { moves, accepted } = partitionActions(actions);
  context.toLand = accepted.map(({ id }) => id);
  countLockFrame(s);
  for (const { type } of moves) {
    applyAction(s, context, type);
    if (isOver(s)) return;
  }
  applyGravity(s, context);
  if (isOver(s)) return;
  if (context.toLand.length > 0) {
    throw new RangeError(
      `garbageAccepted{${context.toLand[0]}} at frame ${s.frame} has no lock that clears nothing left to land at`,
    );
  }
  if (reachedFrameLimit(s)) s.finished = true;
}

function applyAction(s: EngineState, context: LockContext, type: PieceActionType): void {
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
      lock(s, context);
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
function applyGravity(s: EngineState, context: LockContext): void {
  if (onStack(s)) {
    s.gravityCounter = 0;
    if (s.lockTimer >= s.settings.lockDelay) lock(s, context);
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
 * The gravity curve's speed at the current level, or at the level cap above it. With a curve that
 * follows time, its speed at the current frame, or its last speed once the frame is past its end.
 */
function gravityAt({ settings: { gravity }, level, frame }: EngineState): number {
  const { speeds, interval } = gravity;
  // Both whole numbers, so the quotient floors exactly.
  const index = interval === null ? level - 1 : Math.floor(frame / interval);
  // `createEngine` ensures at least one speed.
  return speeds[Math.min(index, speeds.length - 1)] as number;
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
 * Locks the active piece, clears and scores lines and T-spins, sends its attack, lands garbage if
 * it cleared nothing, and spawns the next piece from the queue. A piece that locks entirely above
 * the visible rows locks out: the player tops out and the game stops there, with that piece left
 * active. Garbage that overflows the board tops the player out too, before the next piece spawns.
 */
function lock(s: EngineState, context: LockContext): void {
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
  const { garbage } = s.settings;
  // Before scoring, which moves the combo and back-to-back status on past this lock.
  if (garbage && lines > 0) {
    const sent = sendAttack(s, garbage, calculateAttack(s, clear));
    if (sent > 0) context.out.sent.push({ frame: s.frame, lines: sent });
  }
  scoreLock(s, clear);
  levelUp(s);
  s.holdUsed = false;
  if (reachedLineGoal(s)) {
    s.finished = true;
    return;
  }
  if (garbage && lines === 0) {
    landGarbage(s, garbage, (oldest): oldest is GarbageEntry => lands(s, context, oldest));
  }
  if (s.toppedOut) return;
  spawn(s, nextFromQueue(s));
}

/**
 * Whether a lock that cleared nothing lands lines of `oldest`, the oldest attack in the garbage
 * meter (design §8.5). Accepting garbage, it lands whatever the meter holds, and records a
 * `garbageAccepted` for each attack it lands lines of. Otherwise it lands the attacks the frame's
 * `garbageAccepted` actions name, in order, each of which must be the oldest.
 */
function lands(
  s: EngineState,
  context: LockContext,
  oldest: GarbageEntry | undefined,
): oldest is GarbageEntry {
  if (context.acceptGarbage) {
    if (!oldest) return false;
    context.out.accepted.push({ frame: s.frame, type: ActionType.GarbageAccepted, id: oldest.id });
    return true;
  }
  const id = context.toLand.shift();
  if (id === undefined) return false;
  if (oldest?.id !== id) {
    throw new RangeError(
      `garbageAccepted{${id}} at frame ${s.frame} isn't the oldest garbage in the meter`,
    );
  }
  return true;
}

/** The player's own actions, and the `garbageAccepted` actions apart, each in their order. */
function partitionActions(actions: readonly Action[]): {
  moves: PieceAction[];
  accepted: GarbageAcceptedAction[];
} {
  const moves: PieceAction[] = [];
  const accepted: GarbageAcceptedAction[] = [];
  for (const action of actions) {
    if (action.type === ActionType.GarbageAccepted) accepted.push(action);
    else moves.push(action);
  }
  return { moves, accepted };
}

/** The index after the last of `actions` at `frame`, from `start`. */
function endOfFrame(actions: readonly { frame: number }[], start: number, frame: number): number {
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
  const cap = gravity.speeds.length;
  while (s.level < cap && s.linesCleared >= s.level * linesPerLevel) s.level++;
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
 * state field left out of here is a type error, and unknown input fields are dropped. The mode
 * settings never change, so the copy shares them: the engine freezes them once, as `frozenCopy`, when
 * it takes a state in.
 */
function cloneState(state: EngineState): EngineState {
  const { active, lastTurn, randomizer } = state;
  return {
    settings: state.settings,
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
    marginCarry: state.marginCarry,
    lastHole: state.lastHole && { id: state.lastHole.id, column: state.lastHole.column },
  };
}

/**
 * A deep copy of `value`, frozen, with each object's keys in sorted order, so equal settings have
 * the same JSON whatever order they came in.
 */
function frozenCopy<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy)) as T;
  if (value === null || typeof value !== 'object') return value;
  const keys = Object.keys(value).sort();
  const copy = Object.fromEntries(keys.map((key) => [key, frozenCopy(value[key as keyof T])]));
  return Object.freeze(copy) as T;
}
