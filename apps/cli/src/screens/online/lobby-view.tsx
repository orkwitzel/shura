import type { Clock, OnlineRoom, OnlineSession } from '@shura/client-core';
import { useSettingsStore } from '@shura/client-core/react';
import { SEATS } from '@shura/protocol';
import { Box, Text } from 'ink';
import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { NicknamePrompt } from '../../components/nickname-prompt';
import { useScreenKeys } from '../../platform/input/use-screen-keys';
import { PingText } from './ping-text';
import { ordinal } from './places';
import { roomLink } from './room-link';

export interface LobbyViewProps {
  readonly session: OnlineSession;
  /** The server's URL, for the room's link. */
  readonly server: string;
  readonly clock: Pick<Clock, 'now'>;
  readonly active: boolean;
  /** Esc: the room is left, back to the *Play online* menu. */
  readonly onLeave: () => void;
}

/** How many of the room's events (joins, leaves, host changes) it shows. */
const EVENTS_SHOWN = 3;

const WIDTH = 78;

/** A room's mode as shown. */
export const MODE_NAMES = { '1v1': '1v1', ffa: 'FFA' } as const;

type Member = { readonly id: string; readonly nickname: string };

function membersOf(room: OnlineRoom): Member[] {
  return [...room.players, ...room.spectators];
}

/**
 * The room's events as lines, newest last (design §13.2: joins, leaves and host changes), from
 * how each `roomState` differs from the one before. The first one the view sees has none: it's
 * where the player came in.
 */
function useRoomEvents(room: OnlineRoom, sessionId: string | null): readonly string[] {
  const previous = useRef<OnlineRoom | null>(null);
  const events = useRef<string[]>([]);
  const before = previous.current;
  if (before !== room) {
    previous.current = room;
    if (before) {
      const name = ({ id, nickname }: Member) => (id === sessionId ? 'You' : nickname);
      const was = membersOf(before);
      const now = membersOf(room);
      const lines = [
        ...now
          .filter(({ id }) => !was.some((member) => member.id === id))
          .map((m) => `${name(m)} joined.`),
        ...was
          .filter(({ id }) => !now.some((member) => member.id === id))
          .map((m) => `${name(m)} left.`),
      ];
      const host = now.find(({ id }) => id === room.hostId);
      if (host && room.hostId !== before.hostId) {
        lines.push(host.id === sessionId ? 'You are now host.' : `${host.nickname} is now host.`);
      }
      events.current = [...events.current, ...lines].slice(-EVENTS_SHOWN);
    }
  }
  return events.current;
}

/**
 * A room's lobby (design §13.2, §13.3): its code, its link as text and its mode; the seats, each
 * player's nickname with a dim `guest` or `bot` tag, the host, ready or not, and their place in the
 * last match, then the empty seats; the spectators; your ping; the room's latest events; and the
 * keys. R or Enter toggles ready (Enter is the host's Start, once another seated player is ready),
 * S steps out to spectate or takes a free seat, N changes the nickname (saved to the settings too),
 * and Esc leaves the room.
 */
export function LobbyView({ session, server, clock, active, onLeave }: LobbyViewProps) {
  const { room, sessionId, ping, error, nickname } = useStore(session);
  // Only an error from here on is about this room: one from before is the menu's.
  const [before] = useState(error);
  const settings = useSettingsStore();
  const [renaming, setRenaming] = useState(false);
  const shown = room ?? EMPTY_ROOM;
  const events = useRoomEvents(shown, sessionId);
  const me = shown.players.find(({ id }) => id === sessionId);
  const host = shown.hostId === sessionId;
  const canStart = shown.players.some(({ id, ready }) => id !== sessionId && ready);

  useScreenKeys({ active: active && !renaming, clock }, ({ input, key }, press) => {
    if (!press || !room) return;
    const letter = input.toLowerCase();
    if (key.escape) {
      session.leaveRoom();
      onLeave();
    } else if (key.return && host) {
      if (canStart) session.startMatch();
    } else if ((key.return || letter === 'r') && me && !host) {
      session.setReady(!me.ready);
    } else if (letter === 's') {
      if (me) session.spectate();
      else session.takeSeat();
    } else if (letter === 'n') {
      setRenaming(true);
    }
  });

  if (renaming) {
    return (
      <NicknamePrompt
        initial={nickname ?? ''}
        fresh={false}
        active={active}
        clock={clock}
        onAccept={(name) => {
          session.setNickname(name);
          settings.update({ nickname: name });
          settings.save();
          setRenaming(false);
        }}
        onCancel={() => setRenaming(false)}
      />
    );
  }

  const seats = SEATS[shown.mode];
  const link = roomLink(server, shown.code);
  const keys = [
    host
      ? canStart
        ? 'Enter start'
        : 'Enter start (when another player is ready)'
      : me
        ? 'R ready'
        : null,
    me ? 'S spectate' : 'S take a seat',
    'N nickname',
    'Esc leave',
  ].filter((hint) => hint !== null);
  return (
    <Box flexDirection="column" width={WIDTH} marginTop={1}>
      <Box justifyContent="space-between">
        <Text>
          <Text bold color="yellow">
            ROOM {shown.code}
          </Text>
          <Text dimColor>{'  ·  '}</Text>
          <Text bold>{MODE_NAMES[shown.mode]}</Text>
        </Text>
        <PingText ping={ping} />
      </Box>
      <Text dimColor>
        Invite: shura join {shown.code}
        {link && `  ·  ${link}`}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>
          SEATS {shown.players.length}/{seats}
        </Text>
        {Array.from({ length: seats }, (_, seat) => {
          const player = shown.players.find((each) => each.seat === seat);
          if (!player) {
            return (
              <Text key={`seat-${seat}`} dimColor>
                {'  ·  empty'}
              </Text>
            );
          }
          const you = player.id === sessionId;
          const status =
            player.id === shown.hostId ? (
              <Text color="yellow">host</Text>
            ) : player.ready ? (
              <Text color="green">ready</Text>
            ) : (
              <Text dimColor>not ready</Text>
            );
          return (
            <Box key={player.id}>
              <Text>{you ? '› ' : '  '}</Text>
              <Box width={24}>
                <Text bold={you}>
                  {player.nickname}
                  {you ? ' (you)' : ''}
                </Text>
              </Box>
              <Box width={7}>
                <Text dimColor>{player.kind}</Text>
              </Box>
              <Box width={11}>{status}</Box>
              {player.lastPlace !== undefined && (
                <Text dimColor>last {ordinal(player.lastPlace)}</Text>
              )}
            </Box>
          );
        })}
      </Box>
      {shown.spectators.length > 0 && (
        <Box marginTop={1}>
          <Text>
            <Text dimColor>WATCHING ({shown.spectators.length}) </Text>
            {shown.spectators
              .map(({ id, nickname: name }) => (id === sessionId ? `${name} (you)` : name))
              .join(', ')}
          </Text>
        </Box>
      )}
      <Box flexDirection="column" marginTop={1}>
        {events.map((event, at) => (
          // Lines in order, newest last: their place is their identity.
          <Text key={at} dimColor>
            {event}
          </Text>
        ))}
        {error && error !== before && <Text color="yellow">{error.message}</Text>}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{keys.join('  ')}</Text>
      </Box>
    </Box>
  );
}

const EMPTY_ROOM: OnlineRoom = {
  code: '',
  mode: '1v1',
  phase: 'lobby',
  players: [],
  spectators: [],
};
