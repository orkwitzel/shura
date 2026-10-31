import {
  formatFrames,
  formatHeadline,
  formatScore,
  type SoloSession,
  soloResult,
} from '@shura/client-core';
import { useSession } from '@shura/client-core/react';
import { Dialog } from '@/components/ui/dialog';
import { type MenuItem, MenuList } from '@/components/ui/menu-list';
import { MODE_NAMES } from '@/config/modes';
import styles from './results.module.css';

export interface ResultsProps {
  readonly session: SoloSession;
  /** The personal best line ("New personal best!", or how far off it), once the run is recorded. */
  readonly personalBest: string | undefined;
  /** Enter or Esc: back to the main menu. */
  readonly onBack: () => void;
}

/** A label and its value. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * The results, over the board once a game has ended (design §13.1, Single-player session): "Finished"
 * or "Game over", the mode's headline (Sprint's time, or the score), the personal best line, then
 * the lines, pieces, pieces per second, the score or time the headline isn't, and the level. Restart
 * (R) plays the mode again; Enter (the cursor starts on Main menu) or Esc goes back.
 */
export function Results({ session, personalBest, onBack }: ResultsProps) {
  const ended = useSession(session, (state) => state.phase === 'ended');
  const result = ended ? soloResult(session.getState()) : null;
  const mode = session.getState().mode;

  const items: MenuItem[] = [
    { id: 'again', label: 'Play again', shortcut: 'KeyR', onSelect: () => session.restart() },
    { id: 'back', label: 'Main menu', shortcut: 'Escape', onSelect: onBack },
  ];
  const timed = result?.headline.kind === 'time';

  return (
    <Dialog
      open={ended}
      title={result?.outcome === 'finished' ? 'Finished' : 'Game over'}
      onClose={onBack}
    >
      {result && (
        <>
          <p className={styles.mode}>{MODE_NAMES[mode]}</p>
          <p className={styles.headline}>{formatHeadline(result.headline)}</p>
          <p role="status" className={styles.personalBest}>
            {personalBest}
          </p>
          <dl className={styles.stats}>
            <Stat label="Lines" value={String(result.lines)} />
            <Stat label="Pieces" value={String(result.pieces)} />
            <Stat label="PPS" value={result.piecesPerSecond.toFixed(2)} />
            {timed ? (
              <Stat label="Score" value={formatScore(result.score)} />
            ) : (
              <Stat label="Time" value={formatFrames(result.frames)} />
            )}
            <Stat label="Level" value={String(result.level)} />
          </dl>
          <MenuList label="Results" items={items} initial="back" autoFocus />
        </>
      )}
    </Dialog>
  );
}
