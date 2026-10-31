import {
  type Clock,
  createSoloSession,
  handlingFrames,
  personalBestLine,
  SKINS,
  type SoloMode,
  THEMES,
} from '@shura/client-core';
import { useRecordsStore, useSession, useSettings } from '@shura/client-core/react';
import type { ReadonlyEngineState } from '@shura/engine';
import { Box } from 'ink';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { Look } from '../../board/look';
import { menuLines } from '../../board/overlay';
import { keyName, type TerminalInput } from '../../platform/input/terminal-input';
import { type InputOptions, useTerminalInput } from '../../platform/input/use-terminal-input';
import type { ColorMode } from '../../platform/terminal/color-mode';
import { ResultsScreen } from '../results/results-screen';
import { SettingsScreen } from '../settings/settings-screen';
import { useCountdownLabel } from './countdown';
import { DebugPanel } from './debug-panel';
import { GameView } from './game-view';
import type { MenuCommand } from './menu-command';

export interface SoloScreenProps {
  readonly mode: SoloMode;
  /** The session's clock, which also stamps key events. */
  readonly clock: Clock;
  /** A fixed seed for every game, restarts included (tests); otherwise each game gets a fresh one. */
  readonly seed?: number;
  readonly colors: ColorMode;
  /** Short notices for the status line (a config file that couldn't be used). */
  readonly notices?: readonly string[];
  /** The input adapter (`auto` by default) and the debug panel (design §7.3). */
  readonly input?: InputOptions;
  /**
   * Whether the screen can be seen. While it can't (the terminal is too small), the game pauses,
   * and the menu and results keys do nothing, so the game can't resume unseen.
   */
  readonly visible?: boolean;
  /** Quit to menu: Q in the in-game menu, or Enter or Esc on the results. */
  readonly onQuit?: () => void;
  /** The `auto` adapter has chosen (design §7.3). */
  readonly onInputChosen?: (choice: 'precise' | 'basic') => void;
}

/**
 * Single-player games of one mode, from mount to unmount: the countdown, the game, the in-game menu
 * over the board while paused, the settings screen in the game's place when the menu opens it, and
 * the results once a game ends, with the debug panel beside them if asked for. While the settings
 * are open no key reaches the game, and what changed there applies when the game resumes. Keys
 * come from the terminal through an input adapter. During a game only the game controls and the
 * menu binding (Esc, P) act; the menu and the results have their own shortcuts. The settings
 * (handling, bindings, ghost, theme and skin) come from the settings store, and each game that ends
 * goes to the records store, whose verdict the results show. Unmounting stops the session's loop.
 */
export function SoloScreen({
  mode,
  clock,
  seed,
  colors,
  notices,
  input = { choice: 'auto' },
  visible = true,
  onQuit,
  onInputChosen,
}: SoloScreenProps) {
  const { handling, bindings, ghost, theme, skin } = useSettings();
  const records = useRecordsStore();
  const [session] = useState(() =>
    createSoloSession({
      mode,
      clock,
      handling: handlingFrames(handling),
      ...(seed !== undefined && { seed }),
    }),
  );
  // A session never stops waking on its own: pausing is how it lets go of the clock.
  useEffect(() => () => session.pause(), [session]);
  // Handling changed in the settings applies from the next frame (design §7.4).
  useEffect(() => session.setInput({ handling: handlingFrames(handling) }), [session, handling]);
  // A terminal too small to show the game pauses it (design §13.3), as the message replaces it.
  useLayoutEffect(() => {
    if (!visible) session.pause();
  }, [visible, session]);
  const state = useSession(session);

  // Each game that ends goes to the records once (design §13.1): quitting mid-game writes nothing.
  // A restart makes a new engine, which is how a new game is told apart.
  const [verdict, setVerdict] = useState<{ game: ReadonlyEngineState; line: string } | null>(null);
  useEffect(() => {
    if (state.phase !== 'ended' || verdict?.game === state.engine) return;
    const ended = session.getState();
    setVerdict({ game: ended.engine, line: personalBestLine(ended.mode, records.submit(ended)) });
  }, [state.phase, state.engine, verdict, records, session]);
  const personalBest = verdict?.game === state.engine ? verdict.line : undefined;
  const look: Look = useMemo(
    () => ({ colors, theme: THEMES[theme], skin: SKINS[skin] }),
    [colors, theme, skin],
  );
  const countdown = useCountdownLabel(state);
  // The settings screen, opened from the menu, takes the game's place and every key until it closes.
  const [settingsOpen, setSettingsOpen] = useState(false);

  const restart = () => session.restart(seed);
  const quit = () => onQuit?.();
  // The in-game menu's fixed shortcuts (design §7.4).
  const menu: MenuCommand[] = [
    { keys: ['escape', 'enter'], hint: 'Esc, Enter', label: 'Resume', run: session.resume },
    { keys: ['r'], hint: 'R', label: 'Restart', run: restart },
    { keys: ['s'], hint: 'S', label: 'Settings', run: () => setSettingsOpen(true) },
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
    const name = press ? keyName(raw) : null;
    const command = name === null ? undefined : commands.find(({ keys }) => keys.includes(name));
    if (!command) return false;
    if (visible) command.run();
    return true;
  };
  const terminalInput = useTerminalInput({
    session,
    clock,
    bindings,
    options: input,
    onMenu: session.pause,
    onChosen: onInputChosen,
    shortcut,
    active: !settingsOpen,
  });

  const overlay =
    state.phase === 'paused' ? menuLines('PAUSED', menu) : countdown ? ['', countdown, ''] : [];
  return (
    <Box flexDirection="row">
      {settingsOpen ? (
        <SettingsScreen onClose={() => setSettingsOpen(false)} active={visible} clock={clock} />
      ) : state.phase === 'ended' ? (
        <ResultsScreen
          state={state}
          keys={results}
          {...(personalBest !== undefined && { personalBest })}
        />
      ) : (
        <GameView
          state={state}
          look={look}
          ghost={ghost}
          input={terminalInput.adapter}
          overlay={overlay}
          {...(notices && { notices })}
        />
      )}
      {input.debug && <DebugPanel {...terminalInput} capture={input.debug.capture?.path} />}
    </Box>
  );
}
