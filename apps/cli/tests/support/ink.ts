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

/**
 * Lets effects, input handlers and re-renders run. Ink's root is a legacy one, so a render is
 * synchronous but its effects (`useInput` turning on and off, a screen's subscriptions) wait for
 * React's scheduler, which runs them in a `setImmediate`. A timer alone can fire before that under
 * load; an immediate queued after the scheduler's runs after it, every time. Each round also lets
 * the effects that the last one's renders scheduled run.
 */
export async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let round = 0; round < SETTLE_ROUNDS; round++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** How many rounds of effects `settle` waits out: more than any screen chains. */
const SETTLE_ROUNDS = 3;

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
