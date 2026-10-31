import type { Clock, Connect, SoloMode, TimerClock } from '@shura/client-core';
import { ClientCoreProvider } from '@shura/client-core/react';
import { Box, useApp } from 'ink';
import { useState } from 'react';
import type { InputOptions } from '../platform/input/use-terminal-input';
import type { ColorMode } from '../platform/terminal/color-mode';
import { EnlargeMessage, useTerminalSize } from '../platform/terminal/terminal-size';
import { MainMenuScreen, type MenuReturn } from '../screens/main-menu/main-menu-screen';
import { OnlineScreen, type RoomStart } from '../screens/online/online-screen';
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
  /** `shura create` or `shura join`: the app opens on that room. */
  readonly online?: OnlineOptions;
  /** Quit with an exit code and a message to print once the terminal is back (a version mismatch). */
  readonly onExit?: (code: number, message: string) => void;
}

/** What online play needs: where to connect, as whom, and the room to open on. */
export interface OnlineOptions {
  readonly start: RoomStart;
  readonly server: string;
  readonly nickname: string;
  readonly clientVersion: string;
  readonly connect: Connect;
  /** The clock, with the timers an online session's pings need. */
  readonly clock: TimerClock;
}

/** The screen the app shows. The menu opens where the player left it, if they did. */
type Screen =
  | { kind: 'menu'; from?: MenuReturn }
  | { kind: 'settings' }
  | { kind: 'solo'; mode: SoloMode }
  | { kind: 'online'; start: RoomStart };

/**
 * The CLI's root: the main menu, the settings screen or a game, centred, or the enlarge message
 * on top while the terminal is too small. The screen stays mounted under the message, paused, so a
 * game isn't lost. The settings and records stores reach every screen through the provider.
 */
export function App({
  mode,
  clock,
  seed,
  colors,
  input = { choice: 'auto' },
  online,
  onExit,
  settings,
  records,
  notices,
}: AppProps) {
  const size = useTerminalSize();
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>(
    online
      ? { kind: 'online', start: online.start }
      : mode
        ? { kind: 'solo', mode }
        : { kind: 'menu' },
  );
  // Back to the menu, which opens where it was left: on Settings, or on the mode played.
  const toMenu = () =>
    setScreen({ kind: 'menu', from: screen.kind === 'solo' ? screen.mode : 'settings' });
  // The adapter asked for, until the first game chooses one for every game after it: the terminal
  // doesn't change.
  const [choice, setChoice] = useState(input.choice);
  const briefs = notices.map(({ brief }) => brief);
  return (
    <ClientCoreProvider settings={settings} records={records}>
      <Box flexDirection="column" width={size.columns}>
        {!size.bigEnough && <EnlargeMessage {...size} />}
        <Box display={size.bigEnough ? 'flex' : 'none'} flexDirection="column" alignItems="center">
          {screen.kind === 'menu' && (
            <MainMenuScreen
              onPlay={(played) => setScreen({ kind: 'solo', mode: played })}
              onSettings={() => setScreen({ kind: 'settings' })}
              onQuit={() => exit()}
              active={size.bigEnough}
              from={screen.from}
              notices={briefs}
            />
          )}
          {screen.kind === 'settings' && (
            <SettingsScreen onClose={toMenu} active={size.bigEnough} clock={clock} />
          )}
          {screen.kind === 'online' && online && (
            <OnlineScreen
              {...online}
              start={screen.start}
              colors={colors}
              input={{ ...input, choice }}
              visible={size.bigEnough}
              onLeave={() => setScreen({ kind: 'menu' })}
              onExit={(code, message) => {
                onExit?.(code, message);
                exit();
              }}
            />
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
              onInputChosen={setChoice}
              input={{ ...input, choice }}
            />
          )}
        </Box>
      </Box>
    </ClientCoreProvider>
  );
}
