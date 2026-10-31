import type { OnlineSession, TimerClock } from '@shura/client-core';
import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { useScreenKeys } from '../../platform/input/use-screen-keys';
import { ordinal } from './places';

export interface ResultsViewProps {
  readonly session: OnlineSession;
  /** Every player's nickname by id, as long as they've been seen in the room. */
  readonly names: ReadonlyMap<string, string>;
  /** Times the 10 s back to the lobby. */
  readonly clock: TimerClock;
  readonly active: boolean;
  /** Done with the results: to the lobby, or, after a quick-match opponent left, the waiting screen. */
  readonly onBack: () => void;
  /** The room was left (Esc in a quick-match room). */
  readonly onLeave: () => void;
}

/** How long the results stay up in a room with a code, in ms (design §13.2). */
export const RESULTS_MS = 10_000;

/** The seconds left of `ms` from `since`, ticking every half second, and whether they've run out. */
function useSecondsLeft(clock: TimerClock, ms: number, running: boolean): number {
  const [since] = useState(() => clock.now());
  const [now, setNow] = useState(since);
  useEffect(() => {
    if (!running) return;
    let cancel = () => {};
    const tick = () => {
      setNow(clock.now());
      cancel = clock.after(500, tick);
    };
    tick();
    return () => cancel();
  }, [clock, running]);
  return Math.max(0, Math.ceil((since + ms - now) / 1000));
}

/**
 * A match's results (design §13.2, §13.3), in the match's place once it ends: your place as the
 * title, then every player's place with their lines sent, attack per minute and pieces per second,
 * your row marked. Enter, or 10 s, goes back to the lobby. In a quick-match room: Rematch (Enter)
 * and Leave (Esc) instead, and once the opponent has left, Enter goes back to the waiting screen.
 */
export function ResultsView({ session, names, clock, active, onBack, onLeave }: ResultsViewProps) {
  const { match, room, sessionId, quickMatch } = useStore(session);
  const [rematched, setRematched] = useState(false);
  const opponentLeft = room === null && quickMatch === 'opponentLeft';
  const quick = opponentLeft || (room !== null && room.hostId === undefined);
  const left = useSecondsLeft(clock, RESULTS_MS, !quick);

  useEffect(() => {
    if (!quick && left === 0) onBack();
  }, [quick, left]);

  useScreenKeys({ active, clock }, ({ key }, press) => {
    if (!press) return;
    if (key.return) {
      if (!quick || opponentLeft) onBack();
      else if (!rematched) {
        session.rematch();
        setRematched(true);
      }
    } else if (key.escape && quick) {
      if (room) session.leaveRoom();
      onLeave();
    }
  });

  const result = match?.result;
  if (!result) return null;
  const nameOf = (id: string) => names.get(id) ?? 'player';
  const mine = result.placements.find(({ playerId }) => playerId === sessionId);
  const winners = result.placements
    .filter(({ place }) => place === 1)
    .map(({ playerId }) => playerId);
  const opponent = match.players.find(({ playerId }) => playerId !== sessionId);
  const keys = opponentLeft
    ? 'Enter continue'
    : quick
      ? rematched
        ? `Waiting for ${opponent ? nameOf(opponent.playerId) : 'your opponent'}…  Esc leave`
        : 'Enter rematch  Esc leave'
      : `Enter back to lobby (${left} s)`;
  return (
    <Box flexDirection="column" width={60} marginTop={2}>
      <Text bold color="yellow">
        {mine ? `${ordinal(mine.place).toUpperCase()} PLACE` : 'RESULTS'}
      </Text>
      <Text dimColor>
        {winners.length > 0 && `${winners.map(nameOf).join(' and ')} won`}
        {room && ` · room ${room.code}`}
      </Text>
      <Box flexDirection="column" marginY={1}>
        <Row place="#" name="PLAYER" sent="SENT" apm="APM" pps="PPS" dim />
        {[...result.placements]
          .sort((a, b) => a.place - b.place)
          .map(({ playerId, place }) => {
            const stats = result.stats.find((each) => each.playerId === playerId);
            const you = playerId === sessionId;
            return (
              <Row
                key={playerId}
                you={you}
                place={String(place)}
                name={you ? `${nameOf(playerId)} (you)` : nameOf(playerId)}
                sent={String(stats?.linesSent ?? 0)}
                apm={(stats?.apm ?? 0).toFixed(1)}
                pps={(stats?.pps ?? 0).toFixed(2)}
              />
            );
          })}
      </Box>
      {opponentLeft && <Text bold>Opponent left.</Text>}
      <Text dimColor>{keys}</Text>
    </Box>
  );
}

interface RowProps {
  readonly place: string;
  readonly name: string;
  readonly sent: string;
  readonly apm: string;
  readonly pps: string;
  readonly you?: boolean;
  readonly dim?: boolean;
}

/** One line of the table, yours highlighted. */
function Row({ place, name, sent, apm, pps, you = false, dim = false }: RowProps) {
  const text =
    `${place.padStart(2)}  ${name.slice(0, 22).padEnd(22)}` +
    `${sent.padStart(6)}${apm.padStart(7)}${pps.padStart(7)}`;
  return (
    <Box>
      <Text>{you ? '› ' : '  '}</Text>
      <Text dimColor={dim} bold={you} inverse={you} color={you ? 'yellow' : undefined}>
        {` ${text} `}
      </Text>
    </Box>
  );
}
