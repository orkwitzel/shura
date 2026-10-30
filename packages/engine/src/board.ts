import { type ActivePiece, type PieceKind, pieceCells } from './pieces';

export const BOARD_WIDTH = 10;
/** 20 visible rows plus 20 hidden above them (design §3). */
export const BOARD_HEIGHT = 40;
export const VISIBLE_ROWS = 20;

/** Rows bottom-up (`board[0]` is design row 1), each `BOARD_WIDTH` cells. `null` is empty. */
export type Board = (PieceKind | null)[][];

export function createBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, emptyRow);
}

function emptyRow(): (PieceKind | null)[] {
  return Array.from({ length: BOARD_WIDTH }, () => null);
}

/** Whether `piece` leaves the board or overlaps a locked cell. */
export function collides(board: Board, piece: Readonly<ActivePiece>): boolean {
  return pieceCells(piece).some(
    ({ col, row }) =>
      col < 0 || col >= BOARD_WIDTH || row < 0 || row >= BOARD_HEIGHT || board[row]?.[col] !== null,
  );
}

/** Writes `piece` into the board as locked cells. */
export function lockPiece(board: Board, piece: Readonly<ActivePiece>): void {
  for (const { col, row } of pieceCells(piece)) {
    const line = board[row];
    if (line) line[col] = piece.kind;
  }
}

/** Removes full rows, moving the rows above down. Returns how many rows cleared. */
export function clearLines(board: Board): number {
  const kept = board.filter((row) => row.some((cell) => cell === null));
  const cleared = board.length - kept.length;
  board.splice(0, board.length, ...kept, ...Array.from({ length: cleared }, emptyRow));
  return cleared;
}
