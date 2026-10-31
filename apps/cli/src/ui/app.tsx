import type { Clock, SoloMode } from '@shura/client-core';
import { ClientCoreProvider } from '@shura/client-core/react';
import { Box, useApp } from 'ink';
import type { CliStores } from '../config/stores';
import type { ColorMode } from '../render/palette';
import { SoloScreen } from './solo-screen';
import { EnlargeMessage, useTerminalSize } from './terminal-size';
import type { InputOptions } from './use-terminal-input';

export interface AppProps extends CliStores {
  /** The mode `shura solo` was asked for. */
  readonly mode: SoloMode;
  readonly clock: Clock;
  readonly seed?: number;
  readonly colors: ColorMode;
  /** How keys are read (`--input`, `--debug-input`). */
  readonly input?: InputOptions;
}

/**
 * The CLI's root: the screen being shown, centred, or the enlarge message on top while the
 * terminal is too small. The screen stays mounted under the message, paused, so a game isn't lost.
 * The settings and records stores reach every screen through the provider.
 */
export function App({ mode, clock, seed, colors, input, settings, records, notices }: AppProps) {
  const size = useTerminalSize();
  const { exit } = useApp();
  return (
    <ClientCoreProvider settings={settings} records={records}>
      <Box flexDirection="column" width={size.columns}>
        {!size.bigEnough && <EnlargeMessage {...size} />}
        <Box display={size.bigEnough ? 'flex' : 'none'} flexDirection="column" alignItems="center">
          <SoloScreen
            mode={mode}
            clock={clock}
            {...(seed !== undefined && { seed })}
            colors={colors}
            notices={notices.map(({ brief }) => brief)}
            visible={size.bigEnough}
            // There is no main menu yet (#33): quitting to it quits.
            onQuit={() => exit()}
            {...(input && { input })}
          />
        </Box>
      </Box>
    </ClientCoreProvider>
  );
}
