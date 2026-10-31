import type { render } from 'ink-testing-library';

type Rendered = ReturnType<typeof render>;

/**
 * Gives ink-testing-library's stdout a size and tells Ink it changed, as a terminal resize does.
 * (Its stdout is 100 columns with no rows, so Ink would otherwise ask the real terminal.)
 */
export function resize(app: Rendered, columns: number, rows: number): void {
  Object.defineProperty(app.stdout, 'columns', { value: columns, configurable: true });
  Object.defineProperty(app.stdout, 'rows', { value: rows, configurable: true });
  app.stdout.emit('resize');
}

/** Lets effects, input handlers and re-renders run. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A frame's visible board rows, top (row 19) first, split at the walls: what lies left of the board
 * (hold, the HUD), on it, and right of it (the preview). Left and right lose trailing spaces.
 */
export function wallRows(
  frame: string | undefined,
): { left: string; board: string; right: string }[] {
  return (frame ?? '')
    .split('\n')
    .map((line) => line.split('│'))
    .filter((parts) => parts.length === 3)
    .map(([left = '', board = '', right = '']) => ({
      left: left.trimEnd(),
      board,
      right: right.trimEnd(),
    }));
}

/** A frame's visible board rows, top (row 19) first: what lies between the walls. */
export function visibleRows(frame: string | undefined): string[] {
  return wallRows(frame).map(({ board }) => board);
}
