import { hasEnded } from '@shura/client-core';
import {
  BOARD_WIDTH,
  canMove,
  pieceCells,
  type ReadonlyEngineState,
  VISIBLE_ROWS,
} from '@shura/engine';
import { type Paint, paintRow } from './cells';
import { type Look, WALLS } from './look';

/** How to draw a board: the look of its cells, and whether to show the ghost (a setting). */
export interface BoardStyle extends Look {
  readonly ghost: boolean;
}

/**
 * Rows drawn above the visible 20, without walls, so a piece that has just spawned (rows 21–22,
 * then one row down) or turned up there is seen whole.
 */
export const HIDDEN_ROWS_SHOWN = 2;

/** How far the active piece can fall: where the ghost goes. */
function dropDistance(state: ReadonlyEngineState): number {
  let rows = 0;
  while (canMove(state, 0, -(rows + 1))) rows++;
  return rows;
}

/** Each shown cell's paint, top row first. */
function cellGrid(state: ReadonlyEngineState, ghost: boolean): Paint[][] {
  const top = VISIBLE_ROWS + HIDDEN_ROWS_SHOWN - 1;
  const grid: Paint[][] = [];
  for (let row = top; row >= 0; row--) {
    const fill = row < VISIBLE_ROWS ? 'empty' : 'blank';
    grid.push(
      Array.from({ length: BOARD_WIDTH }, (_, col): Paint => {
        const cell = state.board[row]?.[col] ?? null;
        if (cell === null) return { fill };
        return { fill: 'solid', kind: cell };
      }),
    );
  }
  const put = (col: number, row: number, paint: Paint) => {
    const line = grid[top - row];
    if (line && col >= 0 && col < BOARD_WIDTH) line[col] = paint;
  };
  const { active } = state;
  const over = hasEnded(state);
  if (ghost && !over) {
    const fall = dropDistance(state);
    for (const { col, row } of pieceCells(active)) {
      put(col, row - fall, { fill: 'ghost', kind: active.kind });
    }
  }
  // A game that finished or locked out leaves the piece that locked as the active piece, already
  // drawn as locked cells; a block out leaves the one that couldn't spawn, overlapping the stack.
  for (const { col, row } of pieceCells(active)) {
    put(col, row, { fill: 'solid', kind: active.kind });
  }
  return grid;
}

/**
 * The board as one pre-coloured string per row (design §13.3): the 2 rows above the visible board,
 * the 20 visible rows between the walls, then the floor.
 */
export function boardRows(state: ReadonlyEngineState, style: BoardStyle): string[] {
  const grid = cellGrid(state, style.ghost);
  const rows = grid.map((cells, index) => {
    const painted = paintRow(cells, style);
    return index < HIDDEN_ROWS_SHOWN ? ` ${painted} ` : `${WALLS.side}${painted}${WALLS.side}`;
  });
  rows.push(`${WALLS.left}${WALLS.floor.repeat(BOARD_WIDTH * 2)}${WALLS.right}`);
  return rows;
}
