import { BOARD_WIDTH, VISIBLE_ROWS } from '@shura/engine';
import stringWidth from 'string-width';
import { HIDDEN_ROWS_SHOWN } from './board';
import { WALLS } from './look';
import { padTo } from './text-width';

/** The characters between the walls. */
const INSIDE = BOARD_WIDTH * 2;

/**
 * `rows` (from `boardRows`) with `lines` drawn over the middle of the visible board, between the
 * walls: the countdown, or the in-game menu. The lines are a block, left-aligned with each other and
 * centred together, and each covers a whole board row. Lines longer than the board are cut. Widths
 * are in terminal columns, so a wide or combining character keeps the walls in line.
 */
export function overlayRows(rows: readonly string[], lines: readonly string[]): string[] {
  if (lines.length === 0) return [...rows];
  const width = Math.min(Math.max(...lines.map((line) => stringWidth(line))), INSIDE);
  const left = Math.floor((INSIDE - width) / 2);
  const top = HIDDEN_ROWS_SHOWN + Math.floor((VISIBLE_ROWS - lines.length) / 2);
  const result = [...rows];
  for (const [index, line] of lines.entries()) {
    const inside = padTo(`${' '.repeat(left)}${padTo(line, width)}`, INSIDE);
    result[top + index] = `${WALLS.side}${inside}${WALLS.side}`;
  }
  return result;
}

/**
 * The in-game menu as lines to draw over the board: a title, then each entry's label with its keys
 * at the right, as wide as the board less a column each side, with a blank line around them.
 */
export function menuLines(
  title: string,
  entries: readonly { readonly hint: string; readonly label: string }[],
): string[] {
  const width = INSIDE - 2;
  return [
    '',
    title,
    '',
    ...entries.map(({ label, hint }) => `${padTo(label, width - stringWidth(hint))}${hint}`),
    '',
  ];
}
