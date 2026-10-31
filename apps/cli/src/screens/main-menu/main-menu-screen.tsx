import { type Direction, personalBestSummary, SOLO_MODES, type SoloMode } from '@shura/client-core';
import { useRecords } from '@shura/client-core/react';
import { Box, Text } from 'ink';
import { useState } from 'react';
import { useScreenKeys } from '../../platform/input/use-screen-keys';

/**
 * Where the player comes back to the menu from: the settings, or a game of a mode (design §13.3).
 */
export type MenuReturn = 'settings' | SoloMode;

export interface MainMenuScreenProps {
  /** Start a game of `mode`. */
  readonly onPlay: (mode: SoloMode) => void;
  readonly onSettings: () => void;
  readonly onQuit: () => void;
  /** Whether it takes keys (`true` by default): not while the enlarge message hides it. */
  readonly active?: boolean;
  /**
   * The screen the player comes back from, so the menu opens where they left it: on Settings, or
   * on the mode they played, in Single player. Without it, on Single player.
   */
  readonly from?: MenuReturn;
  /** Short notices under the menu (a stored file that couldn't be used). */
  readonly notices?: readonly string[];
}

/** One line of a menu page. */
interface Entry {
  readonly label: string;
  /** Shown dim beside the label. */
  readonly detail?: string;
  /** Shown dim, and the cursor passes over it. */
  readonly disabled?: boolean;
  readonly run: () => void;
}

type Page = 'main' | 'single';

const MODE_NAMES: Record<SoloMode, string> = {
  sprint: 'Sprint',
  marathon: 'Marathon',
  ultra: 'Ultra',
};

const WIDTH = 48;
const LABEL_WIDTH = 16;
/** The main page's entries, by name, for the cursor. */
const SINGLE_PLAYER = 1;
const SETTINGS = 2;

/** The entry from `at` in `direction` that isn't disabled, or `at` if there's none. */
function nextEntry(entries: readonly Entry[], at: number, direction: Direction): number {
  for (let next = at + direction; next >= 0 && next < entries.length; next += direction) {
    if (!entries[next]?.disabled) return next;
  }
  return at;
}

/**
 * The main menu (design §13.3): Play online (disabled until online play exists), Single player,
 * Settings and Quit. Single player lists the modes, each with its personal best. ↑/↓ move the
 * cursor, Enter chooses, and Esc goes back from Single player. Only presses act (and the key
 * repeat, for ↑/↓), so a key's release, which comes after the screen it opened is gone, does
 * nothing here.
 */
export function MainMenuScreen({
  onPlay,
  onSettings,
  onQuit,
  active = true,
  from,
  notices = [],
}: MainMenuScreenProps) {
  const records = useRecords();
  const played = from === 'settings' ? undefined : from;
  const [page, setPage] = useState<Page>(played ? 'single' : 'main');
  const [cursors, setCursors] = useState<Record<Page, number>>({
    main: from === 'settings' ? SETTINGS : SINGLE_PLAYER,
    single: played ? SOLO_MODES.indexOf(played) : 0,
  });
  const cursor = cursors[page];

  const pages: Record<Page, { title: string; hint: string; entries: Entry[] }> = {
    main: {
      title: 'SHURA',
      hint: '↑↓ choose  Enter select',
      entries: [
        { label: 'Play online', detail: 'coming soon', disabled: true, run: () => {} },
        { label: 'Single player', run: () => setPage('single') },
        { label: 'Settings', run: onSettings },
        { label: 'Quit', run: onQuit },
      ],
    },
    single: {
      title: 'SINGLE PLAYER',
      hint: '↑↓ choose  Enter play  Esc back',
      entries: SOLO_MODES.map((mode) => ({
        label: MODE_NAMES[mode],
        detail: personalBestSummary(mode, records[mode]),
        run: () => onPlay(mode),
      })),
    },
  };
  const { title, hint, entries } = pages[page];
  const move = (direction: Direction) =>
    setCursors((at) => ({ ...at, [page]: nextEntry(entries, at[page], direction) }));

  useScreenKeys({ active }, ({ key }) => {
    if (key.eventType === 'release') return;
    const press = key.eventType !== 'repeat';
    if (key.upArrow) move(-1);
    else if (key.downArrow) move(1);
    else if (key.return && press) entries[cursor]?.run();
    else if (key.escape && press && page === 'single') setPage('main');
  });

  return (
    <Box flexDirection="column" width={WIDTH} marginTop={2}>
      <Text bold>{title}</Text>
      <Box flexDirection="column" marginY={1}>
        {entries.map((entry, at) => (
          <Box key={entry.label}>
            <Text>{at === cursor ? '› ' : '  '}</Text>
            <Box width={LABEL_WIDTH}>
              <Text dimColor={entry.disabled ?? false} bold={at === cursor}>
                {entry.label}
              </Text>
            </Box>
            {entry.detail !== undefined && <Text dimColor>{entry.detail}</Text>}
          </Box>
        ))}
      </Box>
      <Text dimColor>{hint}</Text>
      {notices.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {notices.map((notice) => (
            <Text key={notice}>{notice}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
