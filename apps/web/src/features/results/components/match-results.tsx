import type { ServerMessageOf } from '@shura/protocol';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { type MenuItem, MenuList } from '@/components/ui/menu-list';
import { ordinal } from '@/utils/ordinal';
import styles from './match-results.module.css';

/** How long the results stay up in a room with a code before it goes back to the lobby (§13.2). */
export const RESULTS_SECONDS = 10;

export interface MatchResultsProps {
  /** The server's placements and stats (`matchEnd`). */
  readonly result: ServerMessageOf<'matchEnd'>;
  /** Your session id: your place titles the results and your row is highlighted. `null` watching. */
  readonly you: string | null;
  /** A player's nickname. */
  readonly name: (playerId: string) => string;
  readonly roomCode: string;
  /** A quick-match room has no lobby: *Rematch* and *Leave* instead (design §9.4). */
  readonly quickMatch: boolean;
  /** Enter, Esc, or 10 s, in a room with a code: back to the lobby. */
  readonly onBack: () => void;
  /** Enter, in a quick-match room: the next match starts once both ask. */
  readonly onRematch: () => void;
  /** Esc, in a quick-match room: out of the room. */
  readonly onLeave: () => void;
}

/** The seconds left of `seconds`, a second a step, while `running`; `onDone` once they've run out. */
function useSecondsLeft(seconds: number, running: boolean, onDone: () => void): number {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setLeft((was) => Math.max(was - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (running && left === 0) done.current();
  }, [left, running]);
  return left;
}

/**
 * A match's results, over its boards (design §13.2, Results): your place as the title (or
 * *Results*, for a spectator), who won, then every player by place, those who went out at the same
 * frame sharing one, with their lines sent, attack per minute and pieces per second, your row
 * highlighted. Enter, or 10 s, goes back to the lobby. In a quick-match room *Rematch* (Enter) and
 * *Leave* (Esc) instead, and once you've asked for the rematch it waits for your opponent.
 */
export function MatchResults({
  result,
  you,
  name,
  roomCode,
  quickMatch,
  onBack,
  onRematch,
  onLeave,
}: MatchResultsProps) {
  const [rematched, setRematched] = useState(false);
  const left = useSecondsLeft(RESULTS_SECONDS, !quickMatch, onBack);

  const placements = [...result.placements].sort((a, b) => a.place - b.place);
  const mine = placements.find(({ playerId }) => playerId === you);
  const winners = placements
    .filter(({ place }) => place === 1)
    .map(({ playerId }) => name(playerId));
  const opponent = placements.find(({ playerId }) => playerId !== you);

  const items: MenuItem[] = quickMatch
    ? [
        {
          id: 'rematch',
          label: rematched
            ? `Waiting for ${opponent ? name(opponent.playerId) : 'your opponent'}…`
            : 'Rematch',
          onSelect: () => {
            if (rematched) return;
            setRematched(true);
            onRematch();
          },
        },
        { id: 'leave', label: 'Leave', shortcut: 'Escape', onSelect: onLeave },
      ]
    : [{ id: 'back', label: 'Back to lobby', detail: `${left} s`, onSelect: onBack }];

  return (
    <Dialog
      open
      className={styles.results}
      title={mine ? `${ordinal(mine.place)} place` : 'Results'}
      onClose={quickMatch ? onLeave : onBack}
    >
      <p className={styles.summary}>
        {winners.length > 0 && `${winners.join(' and ')} won · `}room {roomCode}
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Player</th>
            <th scope="col">Sent</th>
            <th scope="col">APM</th>
            <th scope="col">PPS</th>
          </tr>
        </thead>
        <tbody>
          {placements.map(({ playerId, place }, at) => {
            const stats = result.stats.find((each) => each.playerId === playerId);
            const yours = playerId === you;
            return (
              <tr
                key={playerId}
                className={styles.row}
                data-you={yours ? '' : undefined}
                style={{ animationDelay: `${at * 60}ms` }}
              >
                <td className={styles.place}>{place}</td>
                <td className={styles.name}>
                  <span dir="auto">{name(playerId)}</span>
                  {yours && <span className={styles.tag}>you</span>}
                </td>
                <td>{stats?.linesSent ?? 0}</td>
                <td>{(stats?.apm ?? 0).toFixed(1)}</td>
                <td>{(stats?.pps ?? 0).toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <MenuList label="Results" items={items} autoFocus />
    </Dialog>
  );
}
