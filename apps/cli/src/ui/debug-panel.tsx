import { Box, Text } from 'ink';
import { type CaptureEntry, showBytes } from '../input/capture';
import type { AdapterName, InputSignal } from '../input/terminal-input';

/** The panel's width: what's left beside the game in 80 columns. The capture file has it all. */
export const DEBUG_PANEL_WIDTH = 32;

/** What a signal was, in a few words: `moveLeft press`, `menu`. */
function showSignal(signal: InputSignal): string {
  return signal.kind === 'key' ? `${signal.event.action} ${signal.event.kind}` : 'menu';
}

/** One entry: the time since the one before, the key's bytes (`·` if inferred), what it made. */
function showEntry(entry: CaptureEntry, previous: CaptureEntry | undefined): string {
  const gap = previous ? `+${Math.round(entry.time - previous.time)}` : '+0';
  const bytes = entry.bytes === null ? '·' : showBytes(entry.bytes);
  const made = entry.signals.length > 0 ? entry.signals.map(showSignal).join(', ') : '-';
  return `${gap} ${bytes} ${made}`;
}

export interface DebugPanelProps {
  readonly adapter: AdapterName;
  readonly log: readonly CaptureEntry[];
  /** The capture file being written, if any. */
  readonly capture?: string | undefined;
}

/**
 * The hidden `--debug-input` side panel (design §7.3): the adapter, and each raw key with the key
 * events it made, newest last. It's what recordings are captured with and what an input bug
 * report should show.
 */
export function DebugPanel({ adapter, log, capture }: DebugPanelProps) {
  return (
    <Box flexDirection="column" width={DEBUG_PANEL_WIDTH}>
      <Text dimColor>DEBUG INPUT</Text>
      <Text>adapter: {adapter}</Text>
      {capture !== undefined && <Text wrap="truncate-start">{capture}</Text>}
      {log.map((entry, index) => (
        // Entries are rows in order, only ever appended: their index is their identity.
        <Text key={index} wrap="truncate-end">
          {showEntry(entry, log[index - 1])}
        </Text>
      ))}
    </Box>
  );
}
