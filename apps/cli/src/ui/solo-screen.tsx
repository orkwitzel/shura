import { type Clock, createSoloSession, type SoloMode } from '@shura/client-core';
import { useInput } from 'ink';
import { useEffect, useState } from 'react';
import { type Bindings, DEFAULT_BINDINGS } from '../input/bindings';
import { createPreciseAdapter } from '../input/precise';
import type { ColorMode } from '../render/palette';
import { GameView } from './game-view';
import { useSession } from './use-session';

export interface SoloScreenProps {
  readonly mode: SoloMode;
  /** The session's clock, which also stamps key events. */
  readonly clock: Clock;
  /** A fixed seed (tests); otherwise each game gets a fresh one. */
  readonly seed?: number;
  readonly colors: ColorMode;
  readonly ghost?: boolean;
  readonly bindings?: Bindings;
  /** The menu binding was pressed (Esc, P). */
  readonly onMenu?: () => void;
}

/**
 * One single-player game: a session from mount to unmount, fed by the terminal's keys through the
 * precise adapter. Unmounting stops its loop.
 */
export function SoloScreen({
  mode,
  clock,
  seed,
  colors,
  ghost = true,
  bindings = DEFAULT_BINDINGS,
  onMenu,
}: SoloScreenProps) {
  const [session] = useState(() =>
    createSoloSession({ mode, clock, ...(seed !== undefined && { seed }) }),
  );
  // A session never stops waking on its own: pausing is how it lets go of the clock.
  useEffect(() => () => session.pause(), [session]);
  const state = useSession(session);
  const [adapter] = useState(() => createPreciseAdapter(bindings));
  useInput((input, key) => {
    const signal = adapter.feed({ input, key, time: clock.now() });
    if (signal?.kind === 'key') session.key(signal.event);
    else if (signal?.kind === 'menu') onMenu?.();
  });
  return <GameView state={state} colors={colors} ghost={ghost} input={adapter.name} />;
}
