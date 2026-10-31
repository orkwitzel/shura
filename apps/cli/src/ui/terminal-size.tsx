import { Box, Text, useWindowSize } from 'ink';

/** The smallest terminal the CLI draws in (design §13.3). */
export const MIN_COLUMNS = 80;
export const MIN_ROWS = 24;

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
  /** Whether it's at least 80×24. */
  readonly bigEnough: boolean;
}

/** The terminal's size, updated as it changes. */
export function useTerminalSize(): TerminalSize {
  const { columns, rows } = useWindowSize();
  return { columns, rows, bigEnough: columns >= MIN_COLUMNS && rows >= MIN_ROWS };
}

/** Shown instead of everything else while the terminal is under 80×24. */
export function EnlargeMessage({ columns, rows }: TerminalSize) {
  return (
    <Box flexDirection="column">
      <Text bold>Please enlarge the terminal</Text>
      <Text>
        to at least {MIN_COLUMNS}×{MIN_ROWS} (it is {columns}×{rows} now)
      </Text>
    </Box>
  );
}
