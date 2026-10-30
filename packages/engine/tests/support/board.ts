import { createBoard } from '../../src/board';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type EngineState,
  PIECE_KINDS,
  type PieceKind,
  pieceCells,
  type ReadonlyEngineState,
} from '../../src/index';

type Picture = readonly string[];

/**
 * Draws the bottom `rows` rows of the board, top row first. Locked cells show their piece in
 * upper case, the active piece in lower case, and empty cells as `.`.
 */
export function render(state: ReadonlyEngineState, rows = 22): string[] {
  const grid: string[][] = state.board.map((row) => row.map((cell) => cell ?? '.'));
  for (const { col, row } of pieceCells(state.active)) {
    const line = grid[row];
    if (line) line[col] = state.active.kind.toLowerCase();
  }
  return grid
    .slice(0, rows)
    .reverse()
    .map((line) => line.join(''));
}

/**
 * Replaces the bottom of the board with `picture` (top row first, as `render` draws it). Upper-case
 * piece letters are locked cells, and anything else is empty.
 */
export function withBoard(state: EngineState, picture: Picture): EngineState {
  if (picture.length > BOARD_HEIGHT) throw new Error('picture is taller than the board');
  const board = createBoard();
  picture.forEach((line, index) => {
    if (line.length !== BOARD_WIDTH) {
      throw new Error(`picture row "${line}" is not ${BOARD_WIDTH} wide`);
    }
    const row = board[picture.length - 1 - index] as (PieceKind | null)[];
    [...line].forEach((char, col) => {
      row[col] = (PIECE_KINDS as readonly string[]).includes(char) ? (char as PieceKind) : null;
    });
  });
  return { ...state, board };
}

/** An empty board picture of `rows` rows. */
export function emptyRows(rows: number): string[] {
  return Array.from({ length: rows }, () => '.'.repeat(BOARD_WIDTH));
}
