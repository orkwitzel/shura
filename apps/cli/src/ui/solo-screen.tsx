import { type Clock, createSoloSession, type SoloMode } from '@shura/client-core';
import { useSession } from '@shura/client-core/react';
import { Box } from 'ink';
import { useEffect, useLayoutEffect, useState } from 'react';
import { type Bindings, DEFAULT_BINDINGS } from '../input/bindings';
import { keyName, type TerminalInput } from '../input/terminal-input';
import type { ColorMode } from '../render/palette';
import { useCountdownLabel } from './countdown';
import { DebugPanel } from './debug-panel';
import { commandFor, type MenuCommand, menuLines } from './game-menu';
import { GameView } from './game-view';
import { ResultsScreen } from './results';
import { type InputOptions, useTerminalInput } from './use-terminal-input';

export interface SoloScreenProps {
  readonly mode: SoloMode;
  /** The session's clock, which also stamps key events. */
  readonly clock: Clock;
  /** A fixed seed for every game, restarts included (tests); otherwise each game gets a fresh one. */
  readonly seed?: number;
  readonly colors: ColorMode;
  readonly ghost?: boolean;
  readonly bindings?: Bindings;
  /** The input adapter (`auto` by default) and the debug panel (design §7.3). */
  readonly input?: InputOptions;
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
 * over the board while paused, and the results once a game ends, with the debug panel beside them
 * if asked for. Keys come from the terminal through an input adapter. During a game only the game
 * controls and the menu binding (Esc, P) act; the menu and the results have their own shortcuts.
 * Unmounting stops the session's loop.
 */
export function SoloScreen({
  mode,
  clock,
  seed,
  colors,
  ghost = true,
  bindings = DEFAULT_BINDINGS,
  input = { choice: 'auto' },
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

  /**
   * Runs the menu's or the results' shortcut a key press names. Every other key goes on to the
   * adapter, even in the menu and on the results, so a game key held there is held (and charged)
   * at Go, and one released there isn't left held.
   */
  const shortcut = (raw: TerminalInput): boolean => {
    const { phase } = session.getState();
    const commands = phase === 'paused' ? menu : phase === 'ended' ? results : [];
    const press = (raw.key.eventType ?? 'press') === 'press';
    const command = press ? commandFor(commands, keyName(raw)) : undefined;
    if (!command) return false;
    if (visible) command.run();
    return true;
  };
  const keys = useTerminalInput({
    session,
    clock,
    bindings,
    options: input,
    onMenu: session.pause,
    shortcut,
  });

  const overlay =
    state.phase === 'paused' ? menuLines('PAUSED', menu) : countdown ? ['', countdown, ''] : [];
  return (
    <Box flexDirection="row">
      {state.phase === 'ended' ? (
        <ResultsScreen state={state} keys={results} />
      ) : (
        <GameView
          state={state}
          colors={colors}
          ghost={ghost}
          input={keys.adapter}
          overlay={overlay}
        />
      )}
      {input.debug && <DebugPanel {...keys} capture={input.capture?.path} />}
    </Box>
  );
}
