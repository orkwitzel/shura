import { DEFAULT_HANDLING, framesToMs, type Handling, type KeyEvent } from '@shura/client-core';
import {
  ActionType,
  canMove,
  type PieceActionType,
  type ReadonlyEngineState,
  VISIBLE_ROWS,
} from '@shura/engine';
import { choosePlacement, columnHeights, type Placement } from './brain';
import type { BotProfile } from './profile';
import type { Random } from './random';

/** A bot's handling, a person's default (design §7.2): DAS 167 ms, ARR 33 ms, soft drop ×20. */
export const BOT_HANDLING: Handling = DEFAULT_HANDLING;

/** The time and the timers a pilot runs on: an online session's clock. */
export interface PilotClock {
  now(): number;
  after(ms: number, callback: () => void): () => void;
}

/** Where a pilot plays: its own game, and the keys it presses into it. */
export interface Seat {
  /** Your game while you play it, live; `null` before Go and once you're out. */
  game(): ReadonlyEngineState | null;
  /** A key event for your game, at its `time` (which may be a little ahead of now). */
  key(event: KeyEvent): void;
}

export interface PilotOptions {
  readonly clock: PilotClock;
  readonly seat: Seat;
  readonly profile: BotProfile;
  readonly random: Random;
  /** Pieces per second to aim for instead of the profile's, for load tests. */
  readonly pps?: number;
  /** Hears each placement the brain picks, for logs and tests. */
  readonly planned?: (placement: Placement) => void;
}

export interface Pilot {
  /** Stops pressing keys, and releases any held. */
  stop(): void;
}

/**
 * Plays a bot's game like a person (design §13.4): it thinks before each piece, asks the brain
 * where to put it, and steers it there by pressing and releasing keys, which client-core's real
 * input engine turns into actions with human handling: pieces turn a step at a time and slide
 * with DAS and ARR, never teleporting. It looks at the game after each burst of keys and steers
 * from where the piece really is, so gravity, kicks and its own fumbles are corrected as a
 * person would.
 */
export function startPilot(options: PilotOptions): Pilot {
  return new PilotLoop(options);
}

const FRAME_MS = framesToMs(1);
/** How often it looks at a game it isn't playing yet, in ms. */
const IDLE_MS = 50;
/** Frames a tap holds its key, and frames between two taps. */
const TAP_FRAMES = 2;
const TAP_GAP = 5;
/** Frames it waits after a burst of keys before it looks again: the least, plus up to this. */
const REACTION_FRAMES = { min: 2, spread: 4 } as const;
/** Bursts of keys it spends on one piece before it gives up steering and drops it. */
const MAX_BURSTS = 10;

/** One key press or release, `frame` frames into a burst. */
interface Press {
  readonly frame: number;
  readonly action: PieceActionType;
  readonly kind: 'press' | 'release';
}

const tap = (action: PieceActionType, frame = 0): Press[] => [
  { frame, action, kind: 'press' },
  { frame: frame + TAP_FRAMES, action, kind: 'release' },
];

class PilotLoop implements Pilot {
  readonly #options: PilotOptions;
  #cancel: () => void = () => {};
  #stopped = false;
  /** Keys pressed and not yet released. */
  readonly #held = new Set<PieceActionType>();
  /** The piece being played: the game's `piecesPlaced` when it came. */
  #piece = -1;
  #thought = false;
  #placement: Placement | null = null;
  #bursts = 0;
  #fumble = false;
  #softDrop = false;
  #softDropping = false;
  #twisted = false;
  /** The pace, around 1: above it plays faster, below slower. */
  #pace = 1;
  /** When the piece's placement was picked, and how long the last one took to place. */
  #steerStart = 0;
  #steerMs = 0;

  constructor(options: PilotOptions) {
    this.#options = options;
    this.#later(0);
  }

  stop(): void {
    this.#stopped = true;
    this.#cancel();
    const time = this.#options.clock.now();
    for (const action of this.#held) this.#options.seat.key({ action, kind: 'release', time });
    this.#held.clear();
  }

  #later(ms: number, then: () => void = this.#look): void {
    if (this.#stopped) return;
    this.#cancel();
    this.#cancel = this.#options.clock.after(ms, then);
  }

  #look = (): void => {
    const game = this.#options.seat.game();
    if (!game || game.toppedOut || game.finished) {
      this.#later(IDLE_MS);
      return;
    }
    if (game.piecesPlaced !== this.#piece) {
      this.#newPiece(game);
      return;
    }
    if (this.#softDropping) {
      this.#dropSoftly(game);
      return;
    }
    if (!this.#placement) this.#choose(game);
    this.#steer(game);
  };

  /** A new piece: it thinks first, longer when its stack is high (design §13.4). */
  #newPiece(game: ReadonlyEngineState): void {
    if (this.#piece >= 0) this.#steerMs = this.#options.clock.now() - this.#steerStart;
    this.#piece = game.piecesPlaced;
    this.#placement = null;
    this.#thought = false;
    this.#bursts = 0;
    this.#twisted = false;
    this.#release(ActionType.SoftDrop);
    this.#softDropping = false;
    const { profile, random } = this.#options;
    this.#fumble = random() < profile.mistakeRate;
    this.#softDrop = random() < profile.softDropChance;
    this.#later(this.#thinkMs(game), () => {
      this.#thought = true;
      this.#look();
    });
  }

  /**
   * How long it thinks: what the piece's share of its target pace leaves after steering the last
   * piece took, within the profile's range, and at least as long as its stack's height asks for.
   */
  #thinkMs(game: ReadonlyEngineState): number {
    const { profile, random } = this.#options;
    const pps = this.#options.pps ?? profile.pps;
    const scale = profile.pps / pps;
    const { drift } = profile;
    this.#pace = Math.min(1 + drift, Math.max(1 - drift, this.#pace + (random() - 0.5) * drift));
    const min = profile.thinkMs.min * scale;
    const max = profile.thinkMs.max * scale;
    const budget = 1000 / (pps * this.#pace) - this.#steerMs;
    const height = Math.min(1, Math.max(...columnHeights(game.board)) / VISIBLE_ROWS);
    const forHeight = min + (max - min) * height;
    return Math.round(Math.min(max, Math.max(min, budget, forHeight)));
  }

  #choose(game: ReadonlyEngineState): void {
    if (!this.#thought) return;
    const { profile, random, planned } = this.#options;
    this.#placement = choosePlacement(game, profile, random);
    this.#steerStart = this.#options.clock.now();
    if (this.#placement) planned?.(this.#placement);
  }

  /** The next burst of keys, from where the piece is now. */
  #steer(game: ReadonlyEngineState): void {
    if (!this.#thought) return;
    const placement = this.#placement;
    const active = game.active;
    if (!placement || ++this.#bursts > MAX_BURSTS || this.#twisted) {
      this.#burst(tap(ActionType.HardDrop));
      return;
    }
    if (placement.hold && !game.holdUsed && active.kind !== placement.piece.kind) {
      this.#burst(tap(ActionType.Hold));
      return;
    }
    if (active.kind !== placement.piece.kind) {
      // Not the piece it planned for: it thinks again, where the piece is.
      this.#choose(game);
      this.#steer(game);
      return;
    }
    const { approach } = placement;
    if (active.rotation !== approach.rotation) {
      this.#burst(turns((approach.rotation - active.rotation + 4) % 4));
      return;
    }
    if (this.#fumble) {
      // A wrong tap, away from where it is going; the next look corrects it.
      this.#fumble = false;
      const wrong =
        approach.col > active.col
          ? ActionType.MoveLeft
          : approach.col < active.col
            ? ActionType.MoveRight
            : this.#options.random() < 0.5
              ? ActionType.MoveLeft
              : ActionType.MoveRight;
      this.#burst(tap(wrong));
      return;
    }
    if (active.col !== approach.col) {
      this.#burst(slide(approach.col - active.col));
      return;
    }
    if ((placement.twist || this.#softDrop) && canMove(game, 0, -1)) {
      this.#press(ActionType.SoftDrop, 0);
      this.#softDropping = true;
      this.#later(FRAME_MS * 2);
      return;
    }
    if (placement.twist) {
      this.#twisted = true;
      this.#burst(tap(placement.twist));
      return;
    }
    this.#burst(tap(ActionType.HardDrop));
  }

  /** Holds soft drop until the piece rests on the stack, then lets go and steers on. */
  #dropSoftly(game: ReadonlyEngineState): void {
    if (canMove(game, 0, -1)) {
      this.#later(FRAME_MS);
      return;
    }
    this.#release(ActionType.SoftDrop);
    this.#softDropping = false;
    this.#softDrop = false;
    this.#later(this.#reaction());
  }

  /** Presses the burst's keys, each at its frame, and looks again once they have played. */
  #burst(presses: readonly Press[]): void {
    for (const { frame, action, kind } of presses) {
      if (kind === 'press') this.#press(action, frame);
      else this.#release(action, frame);
    }
    const last = Math.max(...presses.map(({ frame }) => frame));
    this.#later(framesToMs(last) + this.#reaction());
  }

  /** A person's pause before they look again. */
  #reaction(): number {
    const frames =
      REACTION_FRAMES.min + Math.floor(this.#options.random() * (REACTION_FRAMES.spread + 1));
    return framesToMs(frames);
  }

  #press(action: PieceActionType, frame: number): void {
    this.#held.add(action);
    this.#key(action, 'press', frame);
  }

  #release(action: PieceActionType, frame = 0): void {
    if (!this.#held.delete(action)) return;
    this.#key(action, 'release', frame);
  }

  /** A key event `frame` frames from now, stamped in the middle of its frame. */
  #key(action: PieceActionType, kind: 'press' | 'release', frame: number): void {
    const time = this.#options.clock.now() + FRAME_MS / 2 + framesToMs(frame);
    this.#options.seat.key({ action, kind, time });
  }
}

/** Turns of a quarter turn each, as taps: clockwise, twice clockwise, or anticlockwise. */
function turns(quarterTurns: number): Press[] {
  if (quarterTurns === 1) return tap(ActionType.RotateCW);
  if (quarterTurns === 3) return tap(ActionType.RotateCCW);
  return [...tap(ActionType.RotateCW), ...tap(ActionType.RotateCW, TAP_GAP)];
}

/**
 * Moves `cols` columns (negative for left): a tap for each of one or two, and for more, the key
 * held through DAS and ARR, let go just after the last column it needs.
 */
function slide(cols: number): Press[] {
  const action = cols < 0 ? ActionType.MoveLeft : ActionType.MoveRight;
  const distance = Math.abs(cols);
  if (distance <= 2) {
    return Array.from({ length: distance }, (_, index) => tap(action, index * TAP_GAP)).flat();
  }
  const { das, arr } = BOT_HANDLING;
  const lastMove = das + (distance - 2) * arr;
  return [
    { frame: 0, action, kind: 'press' },
    { frame: lastMove + 1, action, kind: 'release' },
  ];
}
