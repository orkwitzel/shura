import { type Clock, createSoloSession, type SoloMode } from '@shura/client-core';
import { useSession } from '@shura/client-core/react';
import { useInput } from 'ink';
import { useEffect, useLayoutEffect, useState } from 'react';
import { type Bindings, DEFAULT_BINDINGS } from '../input/bindings';
import { createPreciseAdapter } from '../input/precise';
import { keyName } from '../input/terminal-input';
import type { ColorMode } from '../render/palette';
import { useCountdownLabel } from './countdown';
import { commandFor, type MenuCommand, menuLines } from './game-menu';
import { GameView } from './game-view';
import { ResultsScreen } from './results';

export interface SoloScreenProps {
  readonly mode: SoloMode;
  /** The session's clock, which also stamps key events. */
  readonly clock: Clock;
  /** A fixed seed for every game, restarts included (tests); otherwise each game gets a fresh one. */
  readonly seed?: number;
  readonly colors: ColorMode;
  readonly ghost?: boolean;
  readonly bindings?: Bindings;
  /**
   * Whether the screen can be seen. While it can't (the terminal is too small), the game pauses,
   * and the menu and results keys do nothing, so the game can't resume unseen.
   */
  readonly visible?: boolean;
  /** Quit to menu: Q in the in-game menu, or Enter or Esc on the results. */
  readonly onQuit?: () => void;
}

/**
 * Single-player games of one mode, from mount to unmount: the countdown, the game, the in-game menu
 * over the board while paused, and the results once a game ends. Keys come from the terminal through
 * the precise adapter. During a game only the game controls and the menu binding (Esc, P) act; the
 * menu and the results have their own shortcuts. Unmounting stops the session's loop.
 */
export function SoloScreen({
  mode,
  clock,
  seed,
  colors,
  ghost = true,
  bindings = DEFAULT_BINDINGS,
  visible = true,
  onQuit,
}: SoloScreenProps) {
  const [session] = useState(() =>
    createSoloSession({ mode, clock, ...(seed !== undefined && { seed }) }),
  );
  // A session never stops waking on its own: pausing is how it lets go of the clock.
  useEffect(() => () => session.pause(), [session]);
  // A terminal too small to show the game pauses it (design §13.3), as the message replaces it.
  useLayoutEffect(() => {
    if (!visible) session.pause();
  }, [visible, session]);
  const state = useSession(session);
  const countdown = useCountdownLabel(state);
  const [adapter] = useState(() => createPreciseAdapter(bindings));

  const restart = () => session.restart(seed);
  const quit = () => onQuit?.();
  // The in-game menu's fixed shortcuts (design §7.4).
  const menu: MenuCommand[] = [
    { keys: ['escape', 'enter'], hint: 'Esc', label: 'Resume', run: session.resume },
    { keys: ['r'], hint: 'R', label: 'Restart', run: restart },
    { keys: ['q'], hint: 'Q', label: 'Quit to menu', run: quit },
  ];
  // The results' keys (design §13.1), as the results screen lists them.
  const results: MenuCommand[] = [
    { keys: ['r'], hint: 'R', label: 'Play again', run: restart },
    { keys: ['enter', 'escape'], hint: 'Enter, Esc', label: 'Back', run: quit },
  ];

  useInput((input, key) => {
    const raw = { input, key, time: clock.now() };
    const { phase } = session.getState();
    const commands = phase === 'paused' ? menu : phase === 'ended' ? results : [];
    const command = (key.eventType ?? 'press') === 'press' && commandFor(commands, keyName(raw));
    if (command) {
      if (visible) command.run();
      return;
    }
    // Game keys count in the menu and on the results too, so a key held there is held (and
    // charged) at Go, and one released there isn't left held.
    const signal = adapter.feed(raw);
    if (signal?.kind === 'key') session.key(signal.event);
    else if (signal?.kind === 'menu') session.pause();
  });

  if (state.phase === 'ended') return <ResultsScreen state={state} keys={results} />;
  const overlay =
    state.phase === 'paused' ? menuLines('PAUSED', menu) : countdown ? ['', countdown, ''] : [];
  return (
    <GameView state={state} colors={colors} ghost={ghost} input={adapter.name} overlay={overlay} />
  );
}
