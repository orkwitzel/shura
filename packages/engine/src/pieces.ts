export const PIECE_KINDS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;

export type PieceKind = (typeof PIECE_KINDS)[number];

/**
 * The piece under the player's control. `col` and `row` locate the piece's origin cell on the
 * board, with row 0 the bottom row (design row 1).
 */
export interface ActivePiece {
  kind: PieceKind;
  col: number;
  row: number;
}

export interface Cell {
  col: number;
  row: number;
}

/**
 * Cell offsets from the origin in spawn orientation, rows counting upwards. Every piece spawns
 * flat side down with its origin in column 4, so I and O sit in the middle columns and the rest in
 * the left-middle columns.
 */
const SPAWN_OFFSETS: Record<PieceKind, readonly (readonly [number, number])[]> = {
  I: [
    [-1, 0],
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  O: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  T: [
    [-1, 0],
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  S: [
    [-1, 0],
    [0, 0],
    [0, 1],
    [1, 1],
  ],
  Z: [
    [-1, 1],
    [0, 1],
    [0, 0],
    [1, 0],
  ],
  J: [
    [-1, 1],
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
  L: [
    [1, 1],
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
};

/** The board cells a piece covers. */
export function pieceCells(piece: Readonly<ActivePiece>): Cell[] {
  return SPAWN_OFFSETS[piece.kind].map(([col, row]) => ({
    col: piece.col + col,
    row: piece.row + row,
  }));
}
