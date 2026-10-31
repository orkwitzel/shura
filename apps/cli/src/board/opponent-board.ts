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

/** How an opponent's board is drawn: greyed once they're out (design §10.1). */
export interface OpponentBoardStyle {
  readonly out: boolean;
}

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
  { out }: OpponentBoardStyle,
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
  rows.push(`${WALLS.left}${WALLS.floor.repeat(BOARD_WIDTH)}${WALLS.right}`);
  return rows;
}
