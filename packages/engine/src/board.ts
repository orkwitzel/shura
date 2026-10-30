import { type ActivePiece, type PieceKind, pieceCells } from './pieces';

export const BOARD_WIDTH = 10;
/** 20 visible rows plus 20 hidden above them (design §3). */
export const BOARD_HEIGHT = 40;
export const VISIBLE_ROWS = 20;

/** Rows bottom-up (`board[0]` is design row 1), each `BOARD_WIDTH` cells. `null` is empty. */
export type Board = (PieceKind | null)[][];

/** A board that is only read. */
export type ReadonlyBoard = readonly (readonly (PieceKind | null)[])[];

/** How many rows one lock can clear: a piece spans at most 4 rows. */
export type ClearedLines = 0 | 1 | 2 | 3 | 4;

export function createBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, emptyRow);
}

function emptyRow(): (PieceKind | null)[] {
  return Array.from({ length: BOARD_WIDTH }, () => null);
}

/** Whether `piece` leaves the board or overlaps a locked cell. */
export function collides(board: ReadonlyBoard, piece: Readonly<ActivePiece>): boolean {
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

/** Whether the board has no locked cells. */
export function isEmpty(board: ReadonlyBoard): boolean {
  return board.every((row) => row.every((cell) => cell === null));
}

/** Removes full rows, moving the rows above down. Returns how many rows cleared. */
export function clearLines(board: Board): ClearedLines {
  const kept = board.filter((row) => row.some((cell) => cell === null));
  const cleared = board.length - kept.length;
  board.splice(0, board.length, ...kept, ...Array.from({ length: cleared }, emptyRow));
  // Only the rows the locked piece covers can have filled up.
  return cleared as ClearedLines;
}
