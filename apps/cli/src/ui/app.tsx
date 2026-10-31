import type { Clock, SoloMode } from '@shura/client-core';
import { Box } from 'ink';
import type { ColorMode } from '../render/palette';
import { SoloScreen } from './solo-screen';
import { EnlargeMessage, useTerminalSize } from './terminal-size';

export interface AppProps {
  /** The mode `shura solo` was asked for. */
  readonly mode: SoloMode;
  readonly clock: Clock;
  readonly seed?: number;
  readonly colors: ColorMode;
}

/**
 * The CLI's root: the screen being shown, centred, or the enlarge message on top while the
 * terminal is too small. The screen stays mounted under the message, so a game isn't lost.
 */
export function App({ mode, clock, seed, colors }: AppProps) {
  const size = useTerminalSize();
  return (
    <Box flexDirection="column" width={size.columns}>
      {!size.bigEnough && <EnlargeMessage {...size} />}
      <Box display={size.bigEnough ? 'flex' : 'none'} flexDirection="column" alignItems="center">
        <SoloScreen
          mode={mode}
          clock={clock}
          {...(seed !== undefined && { seed })}
          colors={colors}
        />
      </Box>
    </Box>
  );
}
