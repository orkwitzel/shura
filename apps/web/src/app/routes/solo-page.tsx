import { SOLO_MODES, type SoloMode } from '@shura/client-core';
import { useState } from 'react';
import { Redirect, useLocation, useParams } from 'wouter';
import { MODE_NAMES } from '@/config/modes';
import { ROUTES } from '@/config/routes';
import { BoardCanvas } from '@/features/board/components/board-canvas';
import { Countdown } from '@/features/countdown/components/countdown';
import { GameMenu } from '@/features/game-menu/components/game-menu';
import { Hud } from '@/features/hud/components/hud';
import { Results } from '@/features/results/components/results';
import { SettingsForm } from '@/features/settings/components/settings-form';
import { useSoloSession } from '@/hooks/use-solo-session';
import styles from './solo-page.module.css';

const isSoloMode = (mode: string | undefined): mode is SoloMode =>
  (SOLO_MODES as readonly (string | undefined)[]).includes(mode);

/**
 * One mode's games: the board, with the HUD beside it and the countdown over it, the in-game menu
 * (with the settings) while paused, and the results once a game ends. The game starts once the
 * board is on screen, and no key reaches it while the settings are open.
 */
function SoloGame({ mode }: { mode: SoloMode }) {
  const [, navigate] = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { session, personalBest, start } = useSoloSession(mode, { keys: !settingsOpen });
  const toMainMenu = () => navigate(ROUTES.mainMenu);
  const closeSettings = () => setSettingsOpen(false);
  return (
    <main>
      <h1 className={styles.title}>{MODE_NAMES[mode]}</h1>
      <BoardCanvas
        session={session}
        onShown={start}
        aside={<Hud session={session} />}
        overlay={<Countdown session={session} />}
      />
      <GameMenu
        session={session}
        settings={settingsOpen ? <SettingsForm onClose={closeSettings} /> : null}
        onSettings={() => setSettingsOpen(true)}
        onCloseSettings={closeSettings}
        onQuit={toMainMenu}
      />
      <Results session={session} personalBest={personalBest} onBack={toMainMenu} />
    </main>
  );
}

/**
 * A single-player game of the route's mode (design §13.2). Any mode but `sprint`, `marathon` or
 * `ultra` redirects to the main menu. Another mode, or a refresh, is a fresh session.
 */
export function SoloPage() {
  const { mode } = useParams<{ mode: string }>();
  if (!isSoloMode(mode)) return <Redirect to={ROUTES.mainMenu} replace />;
  return <SoloGame key={mode} mode={mode} />;
}
