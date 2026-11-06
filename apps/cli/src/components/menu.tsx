import type { Direction } from '@shura/client-core';
import { Box, type Key, Text } from 'ink';

/** One line of a menu. */
export interface MenuEntry {
  readonly label: string;
  /** Shown dim beside the label. */
  readonly detail?: string;
  /** Shown dim, and the cursor passes over it. */
  readonly disabled?: boolean;
  readonly run: () => void;
}

/**
 * Where the cursor goes from `at` one step in `direction`: the next item that isn't disabled, or
 * `at` if there's none that way (the cursor stops at the ends).
 */
export function nextIndex(items: readonly object[], at: number, direction: Direction): number {
  for (let next = at + direction; next >= 0 && next < items.length; next += direction) {
    const item = items[next];
    if (item && !('disabled' in item && item.disabled)) return next;
  }
  return at;
}

/**
 * A menu's own keys (design §13.3): ↑/↓ move the cursor (the key repeat too), and a press of Enter
 * runs the entry under it. Whether it took the key: the screen handles the rest (Esc).
 */
export function menuKey(
  key: Key,
  press: boolean,
  entries: readonly MenuEntry[],
  cursor: number,
  moveTo: (at: number) => void,
): boolean {
  if (key.eventType === 'release') return false;
  if (key.upArrow) moveTo(nextIndex(entries, cursor, -1));
  else if (key.downArrow) moveTo(nextIndex(entries, cursor, 1));
  else if (key.return && press) entries[cursor]?.run();
  else return false;
  return true;
}

export interface MenuProps {
  readonly entries: readonly MenuEntry[];
  readonly cursor: number;
  /** The labels' column, after the cursor's two. */
  readonly labelWidth: number;
}

/** A menu's entries, one a line: `›` and the label in bold at the cursor, details dim. */
export function Menu({ entries, cursor, labelWidth }: MenuProps) {
  return (
    <Box flexDirection="column">
      {entries.map((entry, at) => (
        <Box key={entry.label}>
          <Text>{at === cursor ? '› ' : '  '}</Text>
          <Box width={labelWidth}>
            <Text dimColor={entry.disabled ?? false} bold={at === cursor}>
              {entry.label}
            </Text>
          </Box>
          {entry.detail !== undefined && <Text dimColor>{entry.detail}</Text>}
        </Box>
      ))}
    </Box>
  );
}
