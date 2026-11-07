import { formatFrames, formatScore, type SoloSession, timeLeft } from '@shura/client-core';
import { useSession } from '@shura/client-core/react';
import { Stat } from '@/components/stat';
import styles from './hud.module.css';

/** A HUD label and its value. */
/** Lines cleared, out of the mode's line goal if it has one. */
function useLines(session: SoloSession): string {
  const lines = useSession(session, (state) => state.engine.linesCleared);
  const goal = useSession(session, (state) => state.engine.settings.lineGoal);
  return goal === null ? String(lines) : `${lines}/${goal}`;
}

function useScore(session: SoloSession): string {
  return formatScore(useSession(session, (state) => state.engine.score));
}

/** Sprint: the time since Go and the lines towards 40. */
function SprintHud({ session }: HudProps) {
  const frame = useSession(session, (state) => state.engine.frame);
  return (
    <>
      <Stat look="hud" label="Time" value={formatFrames(frame)} />
      <Stat look="hud" label="Lines" value={useLines(session)} />
    </>
  );
}

/** Marathon: the level, the lines towards 150 and the score. */
function MarathonHud({ session }: HudProps) {
  const level = useSession(session, (state) => state.engine.level);
  return (
    <>
      <Stat look="hud" label="Level" value={String(level)} />
      <Stat look="hud" label="Lines" value={useLines(session)} />
      <Stat look="hud" label="Score" value={useScore(session)} />
    </>
  );
}

/** Ultra: the time left of the 2 minutes, and the score. */
function UltraHud({ session }: HudProps) {
  const left = useSession(session, (state) => timeLeft(state.engine) ?? 0);
  return (
    <>
      <Stat look="hud" label="Time left" value={formatFrames(left)} />
      <Stat look="hud" label="Score" value={useScore(session)} />
    </>
  );
}

export interface HudProps {
  readonly session: SoloSession;
}

/**
 * The mode's numbers while playing (design §13.1, Single-player session): Sprint the time since Go
 * and the lines out of 40, Marathon the level, the lines out of 150 and the score, and Ultra the
 * time left and the score.
 */
export function Hud({ session }: HudProps) {
  const mode = useSession(session, (state) => state.mode);
  return (
    <dl className={styles.hud}>
      {mode === 'sprint' && <SprintHud session={session} />}
      {mode === 'marathon' && <MarathonHud session={session} />}
      {mode === 'ultra' && <UltraHud session={session} />}
    </dl>
  );
}
