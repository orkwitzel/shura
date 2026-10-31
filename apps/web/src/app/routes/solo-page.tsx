import { SOLO_MODES, type SoloMode } from '@shura/client-core';
import { Redirect, useParams } from 'wouter';
import { MODE_NAMES } from '@/config/modes';
import { ROUTES } from '@/config/routes';
import { BoardCanvas } from '@/features/board/components/board-canvas';
import { Callouts } from '@/features/callouts/components/callouts';
import { Hud } from '@/features/hud/components/hud';
import { FinalHeadline } from '@/features/results/components/final-headline';
import { useSoloSession } from '@/hooks/use-solo-session';
import styles from './solo-page.module.css';

const isSoloMode = (mode: string | undefined): mode is SoloMode =>
  (SOLO_MODES as readonly (string | undefined)[]).includes(mode);

/**
 * One mode's games: the board, with the HUD and the callouts beside it and the end of the game over
 * it.
 */
function SoloGame({ mode }: { mode: SoloMode }) {
  const { session } = useSoloSession(mode);
  return (
    <main>
      <h1 className={styles.title}>{MODE_NAMES[mode]}</h1>
      <BoardCanvas
        session={session}
        aside={
          <>
            <Hud session={session} />
            <Callouts session={session} />
          </>
        }
        overlay={<FinalHeadline session={session} />}
      />
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
