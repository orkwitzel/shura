import type { Clock, SoloMode } from '@shura/client-core';
import { ClientCoreProvider } from '@shura/client-core/react';
import { Box, useApp } from 'ink';
import { useState } from 'react';
import type { InputOptions } from '../platform/input/use-terminal-input';
import type { ColorMode } from '../platform/terminal/color-mode';
import { EnlargeMessage, useTerminalSize } from '../platform/terminal/terminal-size';
import { MainMenuScreen, type MenuReturn } from '../screens/main-menu/main-menu-screen';
import { SettingsScreen } from '../screens/settings/settings-screen';
import { SoloScreen } from '../screens/solo/solo-screen';
import type { CliStores } from './stores';

export interface AppProps extends CliStores {
  /** The mode `shura solo` was asked for: the app opens on its game. Without it, on the main menu. */
  readonly mode?: SoloMode;
  readonly clock: Clock;
  /** A fixed seed for every game (tests). */
  readonly seed?: number;
  readonly colors: ColorMode;
  /** How keys are read (`--input`, `--debug-input`). */
  readonly input?: InputOptions;
}

/** The screen the app shows. */
type Screen = { kind: 'menu' } | { kind: 'settings' } | { kind: 'solo'; mode: SoloMode };

/**
 * The CLI's root: the main menu, the settings screen or a game, centred, or the enlarge message
 * on top while the terminal is too small. The screen stays mounted under the message, paused, so a
 * game isn't lost. The settings and records stores reach every screen through the provider.
 */
export function App({ mode, clock, seed, colors, input, settings, records, notices }: AppProps) {
  const size = useTerminalSize();
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>(mode ? { kind: 'solo', mode } : { kind: 'menu' });
  // Where the menu was left: it opens there again.
  const [left, setLeft] = useState<MenuReturn | undefined>(mode);
  const go = (next: Screen) => {
    if (next.kind === 'settings') setLeft('settings');
    if (next.kind === 'solo') setLeft(next.mode);
    setScreen(next);
  };
  const toMenu = () => setScreen({ kind: 'menu' });
  // The adapter the first game chose, for every game after it: the terminal doesn't change.
  const [chosen, setChosen] = useState<'precise' | 'basic' | null>(null);
  const gameInput: InputOptions = {
    ...(input ?? { choice: 'auto' }),
    ...(chosen && { choice: chosen }),
  };
  const briefs = notices.map(({ brief }) => brief);
  return (
    <ClientCoreProvider settings={settings} records={records}>
      <Box flexDirection="column" width={size.columns}>
        {!size.bigEnough && <EnlargeMessage {...size} />}
        <Box display={size.bigEnough ? 'flex' : 'none'} flexDirection="column" alignItems="center">
          {screen.kind === 'menu' && (
            <MainMenuScreen
              onPlay={(played) => go({ kind: 'solo', mode: played })}
              onSettings={() => go({ kind: 'settings' })}
              onQuit={() => exit()}
              active={size.bigEnough}
              {...(left && { from: left })}
              notices={briefs}
            />
          )}
          {screen.kind === 'settings' && (
            <SettingsScreen onClose={toMenu} active={size.bigEnough} clock={clock} />
          )}
          {screen.kind === 'solo' && (
            <SoloScreen
              mode={screen.mode}
              clock={clock}
              {...(seed !== undefined && { seed })}
              colors={colors}
              notices={briefs}
              visible={size.bigEnough}
              onQuit={toMenu}
              onInputChosen={setChosen}
              input={gameInput}
            />
          )}
        </Box>
      </Box>
    </ClientCoreProvider>
  );
}
