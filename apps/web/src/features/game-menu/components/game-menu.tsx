import type { SoloSession } from '@shura/client-core';
import { useSession } from '@shura/client-core/react';
import { type ReactNode, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { type MenuItem, MenuList } from '@/components/ui/menu-list';
import styles from './game-menu.module.css';

export interface GameMenuProps {
  readonly session: SoloSession;
  /**
   * The settings screen while it is open over the paused game, in the menu's place, or `null`. Esc
   * there goes back to the menu, through `onCloseSettings`.
   */
  readonly settings: ReactNode;
  /** Settings (S): open the settings screen. */
  readonly onSettings: () => void;
  /** Leave the settings screen, back to the menu. */
  readonly onCloseSettings: () => void;
  /** Quit to menu (Q). The game ends unrecorded. */
  readonly onQuit: () => void;
}

/**
 * The in-game menu (design §7.4), open while the game is paused: by Esc or P, by a stall, or when
 * the window lost focus. Its own fixed shortcuts: Resume (Esc, or Enter on it, where the cursor
 * starts), Restart (R), Settings (S) and Quit to menu (Q). Settings shows the settings screen in
 * the menu's place, and leaving it comes back to the menu, on Settings.
 */
export function GameMenu({
  session,
  settings,
  onSettings,
  onCloseSettings,
  onQuit,
}: GameMenuProps) {
  const paused = useSession(session, (state) => state.phase === 'paused');
  // Back from the settings, the cursor starts on Settings; otherwise on Resume.
  const [fromSettings, setFromSettings] = useState(false);
  const choose =
    (run: () => void, toSettings = false) =>
    () => {
      setFromSettings(toSettings);
      run();
    };
  const resume = choose(() => session.resume());

  const items: MenuItem[] = [
    { id: 'resume', label: 'Resume', shortcut: 'Escape', onSelect: resume },
    {
      id: 'restart',
      label: 'Restart',
      shortcut: 'KeyR',
      onSelect: choose(() => session.restart()),
    },
    { id: 'settings', label: 'Settings', shortcut: 'KeyS', onSelect: choose(onSettings, true) },
    { id: 'quit', label: 'Quit to menu', shortcut: 'KeyQ', onSelect: choose(onQuit) },
  ];

  const showingSettings = settings !== null && settings !== undefined;
  return (
    <Dialog
      open={paused}
      title={showingSettings ? 'Settings' : 'Paused'}
      onClose={showingSettings ? onCloseSettings : resume}
      {...(showingSettings && { className: styles.settings })}
    >
      {showingSettings ? (
        settings
      ) : (
        <MenuList
          label="Game menu"
          items={items}
          initial={fromSettings ? 'settings' : 'resume'}
          autoFocus
        />
      )}
    </Dialog>
  );
}
