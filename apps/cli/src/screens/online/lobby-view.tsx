import {
  type Clock,
  errorText,
  lobbyRole,
  MODE_NAMES,
  type OnlineRoom,
  type OnlineSession,
  ordinal,
  type RoomChange,
  roomChanges,
} from '@shura/client-core';
import { useSettingsStore } from '@shura/client-core/react';
import { SEATS } from '@shura/protocol';
import { Box, Text } from 'ink';
import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { roomLink } from '../../addresses/room-link';
import { NicknamePrompt } from '../../components/nickname-prompt';
import { useScreenKeys } from '../../platform/input/use-screen-keys';
import { PingText } from './ping-text';

export interface LobbyViewProps {
  readonly session: OnlineSession;
  /** The web client's origin, for the room's link. */
  readonly web: string;
  readonly clock: Pick<Clock, 'now'>;
  readonly active: boolean;
  /** Esc: the room is left, back to the *Play online* menu. */
  readonly onLeave: () => void;
}

/** How many of the room's events (joins, leaves, host changes) it shows. */
const EVENTS_SHOWN = 3;

const WIDTH = 78;

/** A room event as the lobby's line says it. */
function eventLine({ kind, nickname, you }: RoomChange): string {
  if (kind === 'joined') return `${nickname} joined.`;
  if (kind === 'left') return `${nickname} left.`;
  return you ? 'You are now host.' : `${nickname} is now host.`;
}

/**
 * The room's events as lines, newest last (design §13.2: joins, leaves and host changes), from
 * how each `roomState` differs from the one before (`roomChanges`). The first one the view sees
 * has none: it's where the player came in.
 */
function useRoomEvents(room: OnlineRoom, sessionId: string | null): readonly string[] {
  const previous = useRef<OnlineRoom | null>(null);
  const events = useRef<string[]>([]);
  if (previous.current !== room) {
    const lines = roomChanges(previous.current, room, sessionId).map(eventLine);
    events.current = [...events.current, ...lines].slice(-EVENTS_SHOWN);
    previous.current = room;
  }
  return events.current;
}

/**
 * A room's lobby (design §13.2, §13.3): its code, its link as text and its mode; the seats, each
 * player's nickname with a dim `guest` or `bot` tag, the host, ready or not, and their place in the
 * last match, then the empty seats; the spectators; your ping, or "Reconnecting…" while the
 * connection is down; the room's latest events; and the keys. R or Enter toggles ready (Enter is
 * the host's Start, once another seated player is ready), S steps out to spectate or takes a free
 * seat, N changes the nickname (saved to the settings too), and Esc leaves the room.
 */
export function LobbyView({ session, web, clock, active, onLeave }: LobbyViewProps) {
  const room = useStore(session, (state) => state.room);
  const sessionId = useStore(session, (state) => state.sessionId);
  const ping = useStore(session, (state) => state.ping);
  const reconnecting = useStore(session, (state) => state.connection.status === 'reconnecting');
  const error = useStore(session, (state) => state.error);
  const nickname = useStore(session, (state) => state.nickname);
  // Only an error from here on is about this room: one from before is the menu's.
  const [before] = useState(error);
  const settings = useSettingsStore();
  const [renaming, setRenaming] = useState(false);
  const shown = room ?? EMPTY_ROOM;
  const events = useRoomEvents(shown, sessionId);
  const role = lobbyRole(shown, sessionId);

  useScreenKeys({ active: active && !renaming, clock }, ({ input, key }, press) => {
    if (!press || !room) return;
    const letter = input.toLowerCase();
    if (key.escape) {
      session.leaveRoom();
      onLeave();
    } else if (key.return && role.kind === 'host') {
      if (role.canStart) session.startMatch();
    } else if ((key.return || letter === 'r') && role.kind === 'player') {
      session.setReady(!role.ready);
    } else if (letter === 's') {
      if (role.kind !== 'spectator') session.spectate();
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
  const link = roomLink(web, shown.code);
  const keys = [
    role.kind === 'host'
      ? role.canStart
        ? 'Enter start'
        : 'Enter start (when another player is ready)'
      : role.kind === 'player'
        ? 'R/Enter ready'
        : null,
    role.kind === 'spectator' ? 'S take a seat' : 'S spectate',
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
        {reconnecting ? <Text color="yellow">Reconnecting…</Text> : <PingText ping={ping} />}
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
        {error && error !== before && (
          <Text color="yellow">{errorText(error.code, error.message)}</Text>
        )}
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
  quickMatch: false,
  players: [],
  spectators: [],
};
