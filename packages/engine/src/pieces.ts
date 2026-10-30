import { type Rotation, srs } from './rotation';

export const PIECE_KINDS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;

export type PieceKind = (typeof PIECE_KINDS)[number];

/**
 * The piece under the player's control. `col` and `row` locate the top-left cell of the piece's box
 * on the board, with row 0 the bottom row (design row 1). The rotation system places its cells in
 * the box for each rotation state.
 */
export interface ActivePiece {
  kind: PieceKind;
  col: number;
  row: number;
  rotation: Rotation;
}

export interface Cell {
  col: number;
  row: number;
}

/** `piece` shifted by `cols` and `rows`. */
export function moved(piece: Readonly<ActivePiece>, cols: number, rows: number): ActivePiece {
  return { ...piece, col: piece.col + cols, row: piece.row + rows };
}

/** The lowest board row a piece covers. */
export function bottomRow(piece: Readonly<ActivePiece>): number {
  let lowest = Infinity;
  for (const [, row] of srs.cellOffsets(piece.kind, piece.rotation)) lowest = Math.min(lowest, row);
  return piece.row + lowest;
}

/** The board cells a piece covers. */
export function pieceCells(piece: Readonly<ActivePiece>): Cell[] {
  return srs.cellOffsets(piece.kind, piece.rotation).map(([col, row]) => ({
    col: piece.col + col,
    row: piece.row + row,
  }));
}
