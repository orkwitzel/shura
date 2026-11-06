import { matchResultRows, ordinal, RESULTS_MS } from '@shura/client-core';
import type { PlayerKind, ServerData } from '@shura/protocol';
import { useEffect, useRef } from 'react';
import { useCountdown } from 'usehooks-ts';
import { Dialog } from '@/components/ui/dialog';
import { type MenuItem, MenuList } from '@/components/ui/menu-list';
import styles from './match-results.module.css';

export interface MatchResultsProps {
  /** The server's placements and stats (`matchEnd`). */
  readonly result: ServerData<'matchEnd'>;
  /** Your session id: your place titles the results and your row is highlighted. `null` watching. */
  readonly you: string | null;
  /** A player's nickname. */
  readonly name: (playerId: string) => string;
  /** A player's kind, `guest` or `bot`, for a dim tag as the lobby has (`null`: not known). */
  readonly kind?: (playerId: string) => PlayerKind | null;
  readonly roomCode: string;
  /** A quick-match room has no lobby: *Rematch* and *Leave* instead (design §9.4). */
  readonly quickMatch: boolean;
  /**
   * Your quick-match opponent left mid-match, breaking the room up (design §9.4): "Opponent
   * left.", and only *Leave* (Enter or Esc).
   */
  readonly opponentLeft?: boolean;
  /** You've asked for the rematch: the server has you ready (design §9.4), across a reconnect. */
  readonly rematchAsked: boolean;
  /** Enter, Esc, or 10 s, in a room with a code: back to the lobby. */
  readonly onBack: () => void;
  /** Enter, in a quick-match room: the next match starts once both ask. */
  readonly onRematch: () => void;
  /** Esc, in a quick-match room: out of the room. */
  readonly onLeave: () => void;
}

/** The whole seconds left of `RESULTS_MS`, a second a step, while `running`; `onDone` at 0, once. */
function useResultsTimer(running: boolean, onDone: () => void): number {
  const [left, { startCountdown }] = useCountdown({ countStart: RESULTS_MS / 1000 });
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (running) startCountdown();
  }, [running, startCountdown]);
  useEffect(() => {
    if (running && left === 0) done.current();
  }, [left, running]);
  return left;
}

/**
 * A match's results, over its boards (design §13.2, Results): your place as the title (or
 * *Results*, for a spectator), who won and the room, then every player by place, those who went
 * out at the same frame sharing one, with their lines sent, attack per minute and pieces per
 * second, your row highlighted and each player's kind (`guest` or `bot`) in a dim tag. Enter, or
 * 10 s, goes back to the lobby. In a quick-match room *Rematch* (Enter) and *Leave* (Esc)
 * instead, and once you've asked for the rematch it waits for your opponent; if your opponent left
 * mid-match, "Opponent left." and only *Leave*.
 */
export function MatchResults({
  result,
  you,
  name,
  kind = () => null,
  roomCode,
  quickMatch,
  opponentLeft = false,
  rematchAsked,
  onBack,
  onRematch,
  onLeave,
}: MatchResultsProps) {
  const left = useResultsTimer(!quickMatch, onBack);

  const { rows, mine, winners } = matchResultRows(result, you);
  const opponent = rows.find((row) => !row.you);

  const leave: MenuItem = { id: 'leave', label: 'Leave', shortcut: 'Escape', onSelect: onLeave };
  const items: MenuItem[] = opponentLeft
    ? [leave]
    : quickMatch
      ? [
          {
            id: 'rematch',
            label: rematchAsked
              ? `Waiting for ${opponent ? name(opponent.playerId) : 'your opponent'}…`
              : 'Rematch',
            onSelect: () => {
              if (!rematchAsked) onRematch();
            },
          },
          leave,
        ]
      : [{ id: 'back', label: 'Back to lobby', detail: `${left} s`, onSelect: onBack }];

  return (
    <Dialog
      open
      className={styles.results}
      title={mine ? `${ordinal(mine.place)} place` : 'Results'}
      onClose={quickMatch || opponentLeft ? onLeave : onBack}
    >
      <p className={styles.summary}>
        {winners.length > 0 && (
          <>
            {winners.map((id, at) => (
              <span key={id}>
                {at > 0 && ' and '}
                <bdi>{name(id)}</bdi>
              </span>
            ))}{' '}
            won
          </>
        )}
        {winners.length > 0 && roomCode && ' · '}
        {roomCode && `room ${roomCode}`}
      </p>
      {opponentLeft && <p className={styles.left}>Opponent left.</p>}
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
          {rows.map(({ playerId, place, linesSent, apm, pps, you: yours }, at) => (
            <tr
              key={playerId}
              className={styles.row}
              data-you={yours ? '' : undefined}
              style={{ animationDelay: `${at * 60}ms` }}
            >
              <td className={styles.place}>{place}</td>
              <td className={styles.name}>
                <bdi>{name(playerId)}</bdi>
                {yours && <span className={styles.tag}>you</span>}
                {kind(playerId) && <span className={styles.kind}>{kind(playerId)}</span>}
              </td>
              <td>{linesSent}</td>
              <td>{apm.toFixed(1)}</td>
              <td>{pps.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* A new menu when the opponent leaves, so its one item takes the focus. */}
      <MenuList key={opponentLeft ? 'left' : 'menu'} label="Results" items={items} autoFocus />
    </Dialog>
  );
}
