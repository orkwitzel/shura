import { personalBestSummary, SOLO_MODES, type SoloMode } from '@shura/client-core';
import { useRecords } from '@shura/client-core/react';
import { Box, Text } from 'ink';
import { useState } from 'react';
import { Menu, type MenuEntry, menuKey } from '../../components/menu';
import { useScreenKeys } from '../../platform/input/use-screen-keys';

/**
 * Where the player comes back to the menu from: the settings, or a game of a mode (design §13.3).
 */
export type MenuReturn = 'settings' | 'online' | SoloMode;

export interface MainMenuScreenProps {
  /** Start a game of `mode`. */
  readonly onPlay: (mode: SoloMode) => void;
  readonly onSettings: () => void;
  /** Open *Play online*. Without it, the entry is off. */
  readonly onOnline?: () => void;
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

type Page = 'main' | 'single';

const MODE_NAMES: Record<SoloMode, string> = {
  sprint: 'Sprint',
  marathon: 'Marathon',
  ultra: 'Ultra',
};

const WIDTH = 48;
const LABEL_WIDTH = 16;
/** The main page's entries, by name, for the cursor. */
const PLAY_ONLINE = 0;
const SINGLE_PLAYER = 1;
const SETTINGS = 2;

/**
 * The main menu (design §13.3): Play online (off without a server: tests), Single player,
 * Settings and Quit. Single player lists the modes, each with its personal best. ↑/↓ move the
 * cursor, Enter chooses, and Esc goes back from Single player. Only presses act (and the key
 * repeat, for ↑/↓), so a key's release, which comes after the screen it opened is gone, does
 * nothing here.
 */
export function MainMenuScreen({
  onPlay,
  onSettings,
  onOnline,
  onQuit,
  active = true,
  from,
  notices = [],
}: MainMenuScreenProps) {
  const records = useRecords();
  const played = from === 'settings' || from === 'online' ? undefined : from;
  const [page, setPage] = useState<Page>(played ? 'single' : 'main');
  const [cursors, setCursors] = useState<Record<Page, number>>({
    main: from === 'settings' ? SETTINGS : from === 'online' ? PLAY_ONLINE : SINGLE_PLAYER,
    single: played ? SOLO_MODES.indexOf(played) : 0,
  });
  const cursor = cursors[page];

  const pages: Record<Page, { title: string; hint: string; entries: MenuEntry[] }> = {
    main: {
      title: 'SHURA',
      hint: '↑↓ choose  Enter select',
      entries: [
        onOnline
          ? { label: 'Play online', run: onOnline }
          : { label: 'Play online', detail: 'no server', disabled: true, run: () => {} },
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
  const moveTo = (at: number) => setCursors((cursors) => ({ ...cursors, [page]: at }));

  useScreenKeys({ active }, ({ key }) => {
    const press = key.eventType === 'press' || key.eventType === undefined;
    if (menuKey(key, press, entries, cursor, moveTo)) return;
    if (key.escape && press && page === 'single') setPage('main');
  });

  return (
    <Box flexDirection="column" width={WIDTH} marginTop={2}>
      <Text bold>{title}</Text>
      <Box flexDirection="column" marginY={1}>
        <Menu entries={entries} cursor={cursor} labelWidth={LABEL_WIDTH} />
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
