import type { ThemeColor } from '@shura/client-core';
import {
  BOARD_WIDTH,
  type BoardCell,
  GARBAGE,
  pieceCells,
  type ReadonlyEngineState,
  VISIBLE_ROWS,
} from '@shura/engine';
import { type Look, WALLS } from './look';
import { centerIn } from './text-width';

/**
 * How an opponent's board is drawn: greyed once they're out (design §10.1), with `lines` (their
 * place and why) over its middle rows.
 */
export interface OpponentBoardStyle {
  readonly out: boolean;
  readonly lines?: readonly string[];
}

/** Characters between an opponent board's walls. */
const INSIDE = BOARD_WIDTH;

/** Without colour, each half-block character by which of its two cells are filled. */
const HALF_GLYPHS = { none: ' ', top: '▀', bottom: '▄', both: '█' } as const;

/** The SGR code that sets the foreground (or, with `background`, the background) to `color`. */
function sgr({ colors }: Look, { rgb, ansi16 }: ThemeColor, background: boolean): string {
  if (colors === 'truecolor') return `\x1b[${background ? 48 : 38};2;${rgb.join(';')}m`;
  const base = background ? 40 : 30;
  return `\x1b[${ansi16 < 8 ? base + ansi16 : base + 60 + ansi16 - 8}m`;
}

/** The visible board with the active piece on it, by row from the bottom. */
function cells(state: ReadonlyEngineState): BoardCell[][] {
  const grid = Array.from({ length: VISIBLE_ROWS }, (_, row) =>
    Array.from({ length: BOARD_WIDTH }, (_, col): BoardCell => state.board[row]?.[col] ?? null),
  );
  for (const { col, row } of pieceCells(state.active)) {
    const line = grid[row];
    if (line && col >= 0 && col < BOARD_WIDTH) line[col] = state.active.kind;
  }
  return grid;
}

/**
 * An opponent's board in half-blocks (design §13.3): 10×20 cells as 10×10 characters, each the
 * upper cell in its foreground (`▀`) and the lower in its background, between walls and over a
 * floor, one pre-coloured string per row. Without colour, the half-blocks alone show which cells
 * are filled.
 */
export function opponentBoardRows(
  state: ReadonlyEngineState,
  look: Look,
  { out, lines = [] }: OpponentBoardStyle,
): string[] {
  const grid = cells(state);
  const colorOf = (cell: Exclude<BoardCell, null>): ThemeColor => {
    if (out) return look.theme.chrome.grid;
    return cell === GARBAGE ? look.theme.garbage : look.theme.pieces[cell];
  };
  const rows: string[] = [];
  for (let row = VISIBLE_ROWS - 1; row > 0; row -= 2) {
    const upper = grid[row] ?? [];
    const lower = grid[row - 1] ?? [];
    let text = '';
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const top = upper[col] ?? null;
      const bottom = lower[col] ?? null;
      if (look.colors === 'none') {
        const filled = top ? (bottom ? 'both' : 'top') : bottom ? 'bottom' : 'none';
        text += HALF_GLYPHS[filled];
      } else if (top === null && bottom === null) {
        text += ' ';
      } else if (top === null) {
        text += `${sgr(look, colorOf(bottom as NonNullable<BoardCell>), false)}▄\x1b[39m`;
      } else {
        const behind = bottom === null ? '' : sgr(look, colorOf(bottom), true);
        text += `${sgr(look, colorOf(top), false)}${behind}▀\x1b[39;49m`;
      }
    }
    rows.push(`${WALLS.side}${text}${WALLS.side}`);
  }
  // The lines go over the middle rows, each centred on its own and cut to the board.
  const top = Math.floor((rows.length - lines.length) / 2);
  for (const [index, line] of lines.entries()) {
    rows[top + index] = `${WALLS.side}${centerIn(line, INSIDE)}${WALLS.side}`;
  }
  rows.push(`${WALLS.left}${WALLS.floor.repeat(BOARD_WIDTH)}${WALLS.right}`);
  return rows;
}

/** An opponent's half-block board on screen, in characters: the meter, walls, a gap; its name. */
export const OPPONENT_BOARD = { width: 14, height: 12 } as const;

/** How many opponent boards fit in `columns`×`rows`: whole boards per row, and in all. */
export function boardsFitting(columns: number, rows: number): { perRow: number; total: number } {
  const perRow = Math.max(0, Math.floor(columns / OPPONENT_BOARD.width));
  return { perRow, total: perRow * Math.max(0, Math.floor(rows / OPPONENT_BOARD.height)) };
}

/** How high a game's stack is, in rows: for the list of opponents when their boards don't fit. */
export function stackHeight({ board }: Pick<ReadonlyEngineState, 'board'>): number {
  for (let row = board.length - 1; row >= 0; row--) {
    if (board[row]?.some((cell) => cell !== null)) return row + 1;
  }
  return 0;
}
