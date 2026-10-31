import {
  ActionType,
  type ActivePiece,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type BoardCell,
  canMove,
  detectTSpin,
  type PieceKind,
  pieceCells,
  type ReadonlyEngineState,
  type Rotation,
  srs,
  TSpin,
  type Turn,
} from '@shura/engine';
import type { BotProfile } from './profile';
import type { Random } from './random';

/** The turn a T makes once it rests on the stack, into a T-spin. */
export type Twist = typeof ActionType.RotateCW | typeof ActionType.RotateCCW;

/** Where the brain wants the piece to go (design §13.4). */
export interface Placement {
  /** Whether to hold first, and place the piece that comes out of the hold slot or the queue. */
  readonly hold: boolean;
  /** The piece as it locks. */
  readonly piece: Readonly<ActivePiece>;
  /** The rotation and column it is steered to near the top, before it drops. */
  readonly approach: { readonly rotation: Rotation; readonly col: number };
  /** For a T-spin, the turn it makes once it rests on the stack. */
  readonly twist: Twist | null;
  /** The holes it makes that the board didn't have. */
  readonly newHoles: number;
  readonly score: number;
}

type Board = readonly (readonly BoardCell[])[];

/** Weights of a board's features (after Yiyuan Lee's tuned weights for this kind of player). */
const WEIGHTS = { height: -0.51, lines: 0.76, holes: -0.36, bumpiness: -0.18 } as const;

/** What a T-spin is worth on top of its lines, for each line it clears. */
const T_SPIN_BONUS = { [TSpin.Full]: 1.5, [TSpin.Mini]: 0.3, [TSpin.None]: 0 } as const;

/** How far below the best a placement may score and still be one of the best few. */
const BEST_FEW_SLACK = 2;

/** How a stack that tops out in the lookahead scores. */
const TOPPED_OUT = -1000;

/** Where a piece is after the engine spawns it: its spawn row, then one row down. */
const SPAWNED_ROW = 20;

/** The turns that reach each rotation from the spawn state, as a person would press them. */
const TURNS: readonly (readonly (1 | 3)[])[] = [[], [1], [1, 1], [3]];

const TWISTS: readonly { quarterTurns: 1 | 3; action: Twist }[] = [
  { quarterTurns: 1, action: ActionType.RotateCW },
  { quarterTurns: 3, action: ActionType.RotateCCW },
];

/**
 * The brain (design §13.4): a pure function from a game and a profile, with a seeded random
 * source, to the placement a bot goes for, or `null` if no piece fits.
 *
 * It finds every place the piece can rest by turning it near the top, sliding it and dropping it
 * (and sometimes the place of the piece it would hold, and for a T sometimes a twist into a
 * T-spin), scores each by the holes, height and bumpiness of the stack it leaves and its lines,
 * looking ahead `profile.lookahead` pieces, and picks among its best few with weighted
 * randomness. It never makes a hole when some placement makes none.
 */
export function choosePlacement(
  game: ReadonlyEngineState,
  profile: BotProfile,
  random: Random,
): Placement | null {
  const tSpins = random() < profile.tSpinChance;
  const considerHold = random() < profile.holdChance;
  const pick = random();
  const space = new Space(game);
  const before = holes(game.board);

  const options: { piece: ActivePiece; hold: boolean; next: PieceKind[] }[] = [
    { piece: game.active, hold: false, next: [...game.queue] },
  ];
  const swapped = game.hold ?? game.queue[0];
  if (considerHold && !game.holdUsed && swapped && swapped !== game.active.kind) {
    const next = game.hold ? [...game.queue] : game.queue.slice(1);
    options.push({ piece: spawned(swapped), hold: true, next });
  }

  const scored: Placement[] = [];
  for (const { piece, hold, next } of options) {
    for (const landing of space.landings(game.board, piece, tSpins)) {
      const after = lockAndClear(game.board, landing.piece);
      const ahead = next.slice(0, profile.lookahead);
      scored.push({
        hold,
        piece: landing.piece,
        approach: landing.approach,
        twist: landing.twist,
        newHoles: Math.max(0, holes(after.board) - before),
        score:
          WEIGHTS.lines * after.lines +
          T_SPIN_BONUS[landing.tSpin] * after.lines +
          value(space, after.board, ahead),
      });
    }
  }
  if (scored.length === 0) return null;

  const fewestHoles = Math.min(...scored.map(({ newHoles }) => newHoles));
  const ranked = scored
    .filter(({ newHoles }) => newHoles === fewestHoles)
    .sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score ?? 0;
  const best = ranked
    .slice(0, Math.max(1, profile.bestOf))
    .filter(({ score }) => score >= top - BEST_FEW_SLACK);
  return weightedPick(best, pick);
}

/** The best the stack can score with `pieces` still to place, or as it stands with none. */
function value(space: Space, board: Board, pieces: readonly PieceKind[]): number {
  const [kind, ...rest] = pieces;
  if (!kind) return evaluate(board);
  let best = Number.NEGATIVE_INFINITY;
  for (const landing of space.landings(board, spawned(kind), false)) {
    const after = lockAndClear(board, landing.piece);
    best = Math.max(best, WEIGHTS.lines * after.lines + value(space, after.board, rest));
  }
  return best === Number.NEGATIVE_INFINITY ? TOPPED_OUT : best;
}

/** One of `placements`, best first, each weighted by how near the top it ranks. */
function weightedPick(placements: readonly Placement[], roll: number): Placement | null {
  const total = (placements.length * (placements.length + 1)) / 2;
  let left = roll * total;
  for (const [index, placement] of placements.entries()) {
    left -= placements.length - index;
    if (left < 0) return placement;
  }
  return placements.at(-1) ?? null;
}

interface Landing {
  piece: ActivePiece;
  approach: { rotation: Rotation; col: number };
  twist: Twist | null;
  tSpin: TSpin;
}

/** Fits pieces on boards through the engine's own `canMove`. */
class Space {
  readonly #probe: { -readonly [Key in keyof ReadonlyEngineState]: ReadonlyEngineState[Key] };

  constructor(game: ReadonlyEngineState) {
    this.#probe = { ...game };
  }

  fits(board: Board, piece: Readonly<ActivePiece>): boolean {
    this.#probe.board = board;
    this.#probe.active = piece;
    return canMove(this.#probe, 0, 0);
  }

  /**
   * Every distinct place `start` can rest by turning near the top, sliding and dropping, and with
   * `twists`, for a T, each twist from there into a T-spin.
   */
  landings(board: Board, start: Readonly<ActivePiece>, twists: boolean): Landing[] {
    if (!this.fits(board, start)) return [];
    const top = Math.max(...columnHeights(board));
    const seen = new Set<string>();
    const found: Landing[] = [];
    const add = (landing: Landing) => {
      const key = `${landing.twist}:${cellsKey(landing.piece)}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push(landing);
    };
    for (const turns of TURNS) {
      let turned: ActivePiece | null = { ...start };
      for (const quarterTurns of turns) {
        turned = turned && (this.#turn(board, turned, quarterTurns)?.piece ?? null);
      }
      if (!turned) continue;
      const from: ActivePiece = turned;
      for (const direction of [-1, 1]) {
        for (let at: ActivePiece = from; this.fits(board, at); at = shifted(at, direction, 0)) {
          if (direction === 1 && at === from) continue;
          const approach = { rotation: at.rotation, col: at.col };
          const rest = this.#drop(board, at, top);
          add({ piece: rest, approach, twist: null, tSpin: TSpin.None });
          if (twists && rest.kind === 'T') {
            for (const twist of this.#twists(board, rest)) add({ ...twist, approach });
          }
        }
      }
    }
    return found;
  }

  /** `piece` dropped as far as it goes, straight to just above the stack's `top` row at first. */
  #drop(board: Board, piece: ActivePiece, top: number): ActivePiece {
    const lowest = Math.min(...pieceCells(piece).map(({ row }) => row));
    let at = lowest > top ? shifted(piece, 0, top - lowest) : piece;
    while (this.fits(board, shifted(at, 0, -1))) at = shifted(at, 0, -1);
    return at;
  }

  /** The twists from `rest` that end resting as a T-spin. */
  #twists(board: Board, rest: ActivePiece): Omit<Landing, 'approach'>[] {
    const found: Omit<Landing, 'approach'>[] = [];
    for (const { quarterTurns, action } of TWISTS) {
      const turn = this.#turn(board, rest, quarterTurns);
      if (!turn || this.fits(board, shifted(turn.piece, 0, -1))) continue;
      const tSpin = detectTSpin(board, turn.piece, turn.turn);
      if (tSpin !== TSpin.None) found.push({ piece: turn.piece, twist: action, tSpin });
    }
    return found;
  }

  /** `piece` turned as the engine turns it: at the first kick where it fits. */
  #turn(
    board: Board,
    piece: Readonly<ActivePiece>,
    quarterTurns: 1 | 3,
  ): { piece: ActivePiece; turn: Turn } | null {
    const rotation = ((piece.rotation + quarterTurns) % 4) as Rotation;
    for (const kick of srs.kicks(piece.kind, piece.rotation, rotation)) {
      const at = { ...piece, col: piece.col + kick[0], row: piece.row + kick[1], rotation };
      if (this.fits(board, at)) return { piece: at, turn: { quarterTurns, kick } };
    }
    return null;
  }
}

/** A piece of `kind` where the engine spawns it. */
function spawned(kind: PieceKind): ActivePiece {
  const width = Math.max(...srs.cellOffsets(kind, 0).map(([col]) => col + 1));
  return { kind, col: (BOARD_WIDTH - width) >> 1, row: SPAWNED_ROW, rotation: 0 };
}

function shifted(piece: Readonly<ActivePiece>, cols: number, rows: number): ActivePiece {
  return { ...piece, col: piece.col + cols, row: piece.row + rows };
}

function cellsKey(piece: Readonly<ActivePiece>): string {
  return pieceCells(piece)
    .map(({ col, row }) => row * BOARD_WIDTH + col)
    .sort((a, b) => a - b)
    .join(',');
}

/** `board` with `piece` locked into it and its full rows cleared. */
function lockAndClear(board: Board, piece: Readonly<ActivePiece>): { board: Board; lines: number } {
  // Rows the piece doesn't touch are shared with `board`, never written.
  const next: (readonly BoardCell[])[] = [...board];
  for (const { col, row } of pieceCells(piece)) {
    const line = next[row];
    if (!line) continue;
    const copy = line === board[row] ? [...line] : (line as BoardCell[]);
    copy[col] = piece.kind;
    next[row] = copy;
  }
  const kept = next.filter((row) => row.includes(null));
  const lines = BOARD_HEIGHT - kept.length;
  for (let row = 0; row < lines; row++) kept.push(Array.from({ length: BOARD_WIDTH }, () => null));
  return { board: kept, lines };
}

/** The stack's score from its height, holes and bumpiness (lines are scored as they clear). */
function evaluate(board: Board): number {
  const heights = columnHeights(board);
  let bumpiness = 0;
  for (let col = 1; col < BOARD_WIDTH; col++) {
    bumpiness += Math.abs((heights[col] ?? 0) - (heights[col - 1] ?? 0));
  }
  const height = heights.reduce((sum, h) => sum + h, 0);
  return (
    WEIGHTS.height * height + WEIGHTS.holes * holes(board, heights) + WEIGHTS.bumpiness * bumpiness
  );
}

/** Each column's height: one above its highest filled cell. */
export function columnHeights(board: Board): number[] {
  return Array.from({ length: BOARD_WIDTH }, (_, col) => {
    for (let row = BOARD_HEIGHT - 1; row >= 0; row--) {
      if (board[row]?.[col] !== null) return row + 1;
    }
    return 0;
  });
}

/** Empty cells with a filled cell somewhere above them. */
function holes(board: Board, heights: readonly number[] = columnHeights(board)): number {
  let count = 0;
  for (let col = 0; col < BOARD_WIDTH; col++) {
    for (let row = 0; row < (heights[col] ?? 0); row++) {
      if (board[row]?.[col] === null) count++;
    }
  }
  return count;
}
