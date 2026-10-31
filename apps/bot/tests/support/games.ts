import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type BoardCell,
  type Cell,
  createEngine,
  type EngineState,
  GARBAGE,
  ONE_VS_ONE,
  type PieceKind,
} from '@shura/engine';

/** Where the engine's spawn leaves a piece: its spawn row, then one row down. */
const SPAWNED_ROW = 20;

/**
 * A 1v1 game whose stack is `rows` (top row first, `X` filled, `.` empty, the last row at the
 * bottom), with a `kind` just spawned as the active piece.
 */
export function gameOf(
  rows: readonly string[],
  kind: PieceKind,
  options: { queue?: PieceKind[]; hold?: PieceKind } = {},
): EngineState {
  const state = createEngine(ONE_VS_ONE, 7, 0).serialize();
  const bottomUp = [...rows].reverse();
  state.board = Array.from({ length: BOARD_HEIGHT }, (_, row) =>
    Array.from({ length: BOARD_WIDTH }, (_, col): BoardCell => {
      const cell = bottomUp[row]?.[col] ?? '.';
      return cell === '.' ? null : GARBAGE;
    }),
  );
  const width = kind === 'I' ? 4 : kind === 'O' ? 2 : 3;
  state.active = { kind, col: (BOARD_WIDTH - width) >> 1, row: SPAWNED_ROW, rotation: 0 };
  if (options.queue) state.queue = options.queue;
  state.hold = options.hold ?? null;
  return state;
}

/** Empty cells with a filled cell above them in their column, counted the plain way. */
export function holes(board: readonly (readonly BoardCell[])[]): number {
  let count = 0;
  for (let col = 0; col < BOARD_WIDTH; col++) {
    let covered = false;
    for (let row = BOARD_HEIGHT - 1; row >= 0; row--) {
      const filled = board[row]?.[col] !== null;
      if (filled) covered = true;
      else if (covered) count++;
    }
  }
  return count;
}

/** `board` with `cells` filled and its full rows cleared. */
export function locked(
  board: readonly (readonly BoardCell[])[],
  cells: readonly Cell[],
): BoardCell[][] {
  const next = board.map((row) => [...row]);
  for (const { col, row } of cells) {
    const line = next[row];
    if (line) line[col] = GARBAGE;
  }
  const kept = next.filter((row) => row.some((cell) => cell === null));
  while (kept.length < BOARD_HEIGHT) kept.push(Array.from({ length: BOARD_WIDTH }, () => null));
  return kept;
}
