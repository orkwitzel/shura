import { isFilled, type ReadonlyBoard } from './board';
import type { ActivePiece } from './pieces';
import type { Offset } from './rotation';

/**
 * Whether a lock is a T-spin, and which kind (design §3). The values are words so that they read
 * as such in error messages and test output. They're never serialized or hashed.
 */
export enum TSpin {
  None = 'none',
  Mini = 'mini',
  Full = 'full',
}

/** A successful turn of the active piece: how far it turned clockwise, and the kick it took. */
export interface Turn {
  quarterTurns: 1 | 2 | 3;
  kick: Offset;
}

/**
 * The four cells diagonal to the centre of a T's 3 × 3 box, as offsets from its top-left cell,
 * clockwise from the top left. A T in rotation state `r` points towards corners `r` and `r + 1`, its
 * front corners.
 */
const CORNERS: readonly Offset[] = [
  [0, 0],
  [2, 0],
  [2, -2],
  [0, -2],
];

/**
 * Classifies a T about to lock as a full T-spin, a mini or none, by the 3-corner rule (design §3).
 * `lastTurn` is the turn that last moved it, or `null` if its last move wasn't a turn. Corners
 * outside the board count as filled. The guideline names only the walls and the floor, but a T with
 * a corner above the top of the board locks out, so it never scores.
 */
export function detectTSpin(
  board: ReadonlyBoard,
  piece: Readonly<ActivePiece>,
  lastTurn: Readonly<Turn> | null,
): TSpin {
  if (piece.kind !== 'T' || lastTurn === null) return TSpin.None;
  const filled = CORNERS.map(([cols, rows]) => isFilled(board, piece.col + cols, piece.row + rows));
  if (filled.filter(Boolean).length < 3) return TSpin.None;
  const bothFront = filled[piece.rotation] && filled[(piece.rotation + 1) % 4];
  return bothFront || isLastQuarterTurnKick(lastTurn) ? TSpin.Full : TSpin.Mini;
}

/**
 * Whether `turn` took the last kick of an SRS quarter turn, which moves the T 1 column and 2 rows.
 * After it a mini still counts as a full T-spin. The 180° kicks that move it as far don't count.
 */
function isLastQuarterTurnKick({ quarterTurns, kick: [cols, rows] }: Readonly<Turn>): boolean {
  return quarterTurns !== 2 && Math.abs(cols) === 1 && Math.abs(rows) === 2;
}
