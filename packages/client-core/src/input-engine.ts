import {
  ActionType,
  canMove,
  currentGravity,
  type PieceActionType,
  type ReadonlyEngineState,
  SUBROWS_PER_ROW,
} from '@shura/engine';
import type { Direction } from './actions';
import { DEFAULT_HANDLING, type Handling } from './handling';

/**
 * A press, repeat or release of a bound key, stamped with the time it arrived on the session's
 * clock (design §7.3). `action` is the game control the key is bound to. Adapters make them: a
 * repeat is the terminal's or OS's own key repeat, which only basic input uses.
 */
export interface KeyEvent {
  readonly action: PieceActionType;
  readonly kind: 'press' | 'repeat' | 'release';
  readonly time: number;
}

/**
 * What moves a held direction after its first move: DAS and ARR ('handling', for precise input and
 * the web), or the key repeat, one move per repeat event ('keyRepeat', for basic input, where DAS
 * and ARR don't apply).
 */
export type AutoShift = 'handling' | 'keyRepeat';

/** How the input engine turns key events into actions. */
export interface InputSettings {
  readonly handling: Handling;
  readonly autoShift: AutoShift;
}

/**
 * The state machine that turns key events and handling into actions (design §7.3), one frame at a
 * time. Make one with `createInputEngine`.
 */
export interface InputEngine {
  /**
   * Plays one frame: takes the key events that arrived before it started, in order, and returns the
   * actions the frame applies. `game` is the engine's state before the frame, or `null` during the
   * countdown, when keys charge but nothing moves.
   */
  playFrame(events: readonly KeyEvent[], game: ReadonlyEngineState | null): PieceActionType[];
  /** Changes the settings given, from the next frame. Keys held stay held. */
  configure(settings: Partial<InputSettings>): void;
}

/** An input engine. Without settings, the default handling and auto-shift by handling. */
export function createInputEngine(settings: Partial<InputSettings> = {}): InputEngine {
  return new InputEngineImpl({ handling: DEFAULT_HANDLING, autoShift: 'handling', ...settings });
}

const MOVES: Readonly<Record<Direction, PieceActionType>> = {
  [-1]: ActionType.MoveLeft,
  1: ActionType.MoveRight,
};

function directionOf(action: PieceActionType): Direction | null {
  if (action === ActionType.MoveLeft) return -1;
  if (action === ActionType.MoveRight) return 1;
  return null;
}

/**
 * The actions the input engine emits in one frame, and where they leave the active piece, so each
 * move is checked against the board where it will apply. After a turn, hold or hard drop, `canMove`
 * can't say where the piece is, so no more moves are emitted that frame: it is blind.
 */
class FrameActions {
  readonly actions: PieceActionType[] = [];
  /** The columns and rows the frame's moves have taken the piece so far. */
  #cols = 0;
  #rows = 0;
  #blind = false;

  constructor(readonly game: ReadonlyEngineState | null) {}

  get blind(): boolean {
    return this.#blind;
  }

  /** A turn, hold or hard drop. */
  add(action: PieceActionType): void {
    this.actions.push(action);
    this.#blind = true;
  }

  /** Moves the piece one column in `direction`, if it can. Returns whether it did. */
  shift(direction: Direction): boolean {
    if (!this.#can(this.#cols + direction, this.#rows)) return false;
    this.#cols += direction;
    this.actions.push(MOVES[direction]);
    return true;
  }

  /** Moves the piece down a row, if it can. Returns whether it did. */
  drop(): boolean {
    if (!this.#can(this.#cols, this.#rows - 1)) return false;
    this.#rows--;
    this.actions.push(ActionType.SoftDrop);
    return true;
  }

  #can(cols: number, rows: number): boolean {
    return this.game !== null && !this.#blind && canMove(this.game, cols, rows);
  }
}

class InputEngineImpl implements InputEngine {
  #settings: InputSettings;
  /** The direction keys held. */
  readonly #held = new Set<Direction>();
  /** The direction that moves: the one held, the last one pressed if both are, or `null`. */
  #direction: Direction | null = null;
  /** Frames the direction has been held, up to DAS. */
  #charge = 0;
  /** Once DAS is charged, frames until the next auto-repeated move. */
  #wait = 0;
  /** Whether soft drop is held. */
  #softDrop = false;
  /** Whether soft drop was pressed since the last frame played: that frame drops at once. */
  #softDropPressed = false;
  /** Sub-rows of soft drop built up towards the next row. */
  #fall = 0;
  /** Key events that arrived after a turn, hold or hard drop in their frame, for the next one. */
  #waiting: KeyEvent[] = [];

  constructor(settings: InputSettings) {
    this.#settings = settings;
  }

  configure(settings: Partial<InputSettings>): void {
    this.#settings = { ...this.#settings, ...settings };
  }

  playFrame(events: readonly KeyEvent[], game: ReadonlyEngineState | null): PieceActionType[] {
    const emitted = new FrameActions(game);
    const queue = [...this.#waiting, ...events];
    this.#waiting = [];
    // A direction pressed in this frame starts DAS: it doesn't charge until the next frame.
    let pressed = false;
    for (const [index, event] of queue.entries()) {
      if (emitted.blind) {
        // The rest waits for the next frame, which shows where the piece went.
        this.#waiting = queue.slice(index);
        break;
      }
      if (this.#take(event, emitted)) pressed = true;
    }
    if (!pressed) this.#autoShift(emitted);
    if (game !== null) this.#dropSoftly(emitted, game);
    return emitted.actions;
  }

  /** Takes one key event. Returns whether it pressed a direction (or handed back to one). */
  #take({ action, kind }: KeyEvent, emitted: FrameActions): boolean {
    if (action === ActionType.SoftDrop) {
      if (kind === 'press') {
        this.#softDrop = true;
        // The press drops a row at once.
        this.#fall = SUBROWS_PER_ROW;
        this.#softDropPressed = true;
      } else if (kind === 'release') {
        this.#softDrop = false;
      }
      return false;
    }
    const direction = directionOf(action);
    if (direction === null) {
      // Turns, hold and hard drop: one action per press, and none during the countdown.
      if (kind === 'press' && emitted.game !== null) emitted.add(action);
      return false;
    }
    if (kind === 'press') {
      this.#held.add(direction);
      this.#press(direction, emitted);
      return true;
    }
    if (kind === 'repeat') {
      if (this.#settings.autoShift === 'keyRepeat' && this.#direction === direction) {
        emitted.shift(direction);
      }
      return false;
    }
    this.#held.delete(direction);
    if (this.#direction !== direction) return false;
    // Releasing the direction that moves hands back to the other one, if it is still held, as if
    // it was pressed again.
    this.#direction = null;
    const other = -direction as Direction;
    if (!this.#held.has(other)) return false;
    this.#press(other, emitted);
    return true;
  }

  /**
   * While soft drop is held, builds up the soft-drop factor times gravity, in sub-rows, and drops a
   * row for each whole row built up. A row the piece can't drop is lost. 'instant' drops to the
   * stack.
   */
  #dropSoftly(emitted: FrameActions, game: ReadonlyEngineState): void {
    if (!this.#softDrop) return;
    const factor = this.#settings.handling.softDropFactor;
    if (factor === 'instant') {
      while (emitted.drop());
      return;
    }
    if (this.#softDropPressed) this.#softDropPressed = false;
    else this.#fall += factor * currentGravity(game);
    // Blind, it can't tell where the piece is: its rows wait for the next frame.
    if (emitted.blind) return;
    for (; this.#fall >= SUBROWS_PER_ROW; this.#fall -= SUBROWS_PER_ROW) emitted.drop();
  }

  /** A direction pressed: one move, and DAS starts charging. With DAS 0, auto-repeat starts. */
  #press(direction: Direction, emitted: FrameActions): void {
    this.#direction = direction;
    this.#charge = 0;
    const moved = emitted.shift(direction);
    const { das, arr } = this.#settings.handling;
    if (das > 0 || this.#settings.autoShift === 'keyRepeat') return;
    if (arr === 0) this.#repeat(direction, emitted);
    else this.#wait = moved ? arr : 0;
  }

  /** Charges DAS for the direction held, and once it is charged, moves every ARR frames. */
  #autoShift(emitted: FrameActions): void {
    const direction = this.#direction;
    if (direction === null || this.#settings.autoShift === 'keyRepeat') return;
    const { das, arr } = this.#settings.handling;
    if (this.#charge < das) {
      this.#charge++;
      if (this.#charge < das) return;
    } else if (arr > 0 && --this.#wait > 0) {
      return;
    }
    this.#repeat(direction, emitted);
  }

  /**
   * An auto-repeated move: at ARR 0, as far as the piece can go towards the wall. A move the piece
   * can't make waits for the next frame.
   */
  #repeat(direction: Direction, emitted: FrameActions): void {
    const { arr } = this.#settings.handling;
    if (arr === 0) {
      while (emitted.shift(direction));
    } else if (emitted.shift(direction)) {
      this.#wait = arr;
    }
  }
}
