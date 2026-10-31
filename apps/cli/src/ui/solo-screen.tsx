import { type Clock, createSoloSession, type SoloMode } from '@shura/client-core';
import { Box } from 'ink';
import { useEffect, useState } from 'react';
import { type Bindings, DEFAULT_BINDINGS } from '../input/bindings';
import type { ColorMode } from '../render/palette';
import { DebugPanel } from './debug-panel';
import { GameView } from './game-view';
import { useSession } from './use-session';
import { type InputOptions, useTerminalInput } from './use-terminal-input';

export interface SoloScreenProps {
  readonly mode: SoloMode;
  /** The session's clock, which also stamps key events. */
  readonly clock: Clock;
  /** A fixed seed (tests); otherwise each game gets a fresh one. */
  readonly seed?: number;
  readonly colors: ColorMode;
  readonly ghost?: boolean;
  readonly bindings?: Bindings;
  /** The input adapter (`auto` by default) and the debug panel (design §7.3). */
  readonly input?: InputOptions;
  /** The menu binding was pressed (Esc, P). */
  readonly onMenu?: () => void;
}

/**
 * One single-player game: a session from mount to unmount, fed by the terminal's keys through an
 * input adapter, with the debug panel beside it if asked for. Unmounting stops its loop.
 */
export function SoloScreen({
  mode,
  clock,
  seed,
  colors,
  ghost = true,
  bindings = DEFAULT_BINDINGS,
  input = { choice: 'auto' },
  onMenu,
}: SoloScreenProps) {
  const [session] = useState(() =>
    createSoloSession({ mode, clock, ...(seed !== undefined && { seed }) }),
  );
  // A session never stops waking on its own: pausing is how it lets go of the clock.
  useEffect(() => () => session.pause(), [session]);
  const state = useSession(session);
  const keys = useTerminalInput({ session, clock, bindings, options: input, onMenu });
  return (
    <Box flexDirection="row">
      <GameView state={state} colors={colors} ghost={ghost} input={keys.adapter} />
      {input.debug && <DebugPanel {...keys} capture={input.capture?.path} />}
    </Box>
  );
}
