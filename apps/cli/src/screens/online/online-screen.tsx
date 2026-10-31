import {
  type Connect,
  createOnlineSession,
  handlingFrames,
  type OnlineSessionState,
  SKINS,
  THEMES,
  type TimerClock,
} from '@shura/client-core';
import { useSettings } from '@shura/client-core/react';
import { Box, Text } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { Look } from '../../board/look';
import { useScreenKeys } from '../../platform/input/use-screen-keys';
import { type InputOptions, useTerminalInput } from '../../platform/input/use-terminal-input';
import type { ColorMode } from '../../platform/terminal/color-mode';
import { LobbyView } from './lobby-view';
import { MatchView } from './match-view';

/** What the screen opens on: a new room, or the room with a code. */
export type RoomStart =
  | { readonly action: 'create'; readonly mode: '1v1' | 'ffa' }
  | { readonly action: 'join'; readonly code: string };

/** What the CLI prints on a version mismatch, after giving the terminal back (design §8.3). */
export const VERSION_MISMATCH_MESSAGE =
  'A new version of Shura is out. Update it to play online:\n  npm i -g shura@latest';

export interface OnlineScreenProps {
  readonly start: RoomStart;
  /** The gateway's WebSocket URL. */
  readonly server: string;
  readonly nickname: string;
  readonly clientVersion: string;
  readonly connect: Connect;
  readonly clock: TimerClock;
  readonly colors: ColorMode;
  readonly input: InputOptions;
  /** Whether it takes keys: not while the enlarge message hides it. */
  readonly visible: boolean;
  /** Esc in the lobby, or after a failure: back to the menu. */
  readonly onLeave: () => void;
  /** Quit the CLI with `code`, printing `message` once the terminal is back. */
  readonly onExit: (code: number, message: string) => void;
}

/** Whether you're playing a match that's on: counting down, or playing and not out. */
function playing({ match }: OnlineSessionState): boolean {
  if (!match || match.phase === 'ended') return false;
  const me = match.players.find(({ playerId }) => playerId === match.playerId);
  return me !== undefined && me.out === null;
}

/**
 * Online play, bare-bones (#60; #67 brings the real screens): the connection, the lobby of the room
 * `start` names, the match, and a results line back in the lobby. One online session from mount to
 * unmount (design §13.1): it connects as the screen opens and closes as it goes. A version
 * mismatch quits the CLI with code 1 and `npm i -g shura@latest` (design §13.3).
 */
export function OnlineScreen({
  start,
  server,
  nickname,
  clientVersion,
  connect,
  clock,
  colors,
  input,
  visible,
  onLeave,
  onExit,
}: OnlineScreenProps) {
  const { handling, bindings, ghost, theme, skin } = useSettings();
  const [session] = useState(() =>
    createOnlineSession({
      url: server,
      connect,
      clock,
      nickname,
      clientVersion,
      handling: handlingFrames(handling),
    }),
  );
  useEffect(() => {
    if (start.action === 'create') session.createRoom(start.mode);
    else session.joinRoom(start.code);
    return () => session.close();
  }, [session]);
  useEffect(() => session.setInput({ handling: handlingFrames(handling) }), [session, handling]);
  const state = useStore(session);
  const { connection, room, match } = state;

  useEffect(() => {
    if (connection.status === 'failed' && connection.reason === 'version_mismatch') {
      onExit(1, VERSION_MISMATCH_MESSAGE);
    }
  }, [connection]);

  const inMatch = playing(state);
  const look: Look = useMemo(
    () => ({ colors, theme: THEMES[theme], skin: SKINS[skin] }),
    [colors, theme, skin],
  );
  useTerminalInput({ session, clock, bindings, options: input, active: inMatch && visible });
  useScreenKeys({ active: visible && !inMatch, clock }, ({ key }, press) => {
    if (!press) return;
    if (key.escape) {
      if (session.getState().room) session.leaveRoom();
      onLeave();
      return;
    }
    const { room, sessionId } = session.getState();
    if (!key.return || !room || room.phase !== 'lobby') return;
    if (room.hostId === sessionId) session.startMatch();
    else session.setReady(!room.players.find(({ id }) => id === sessionId)?.ready);
  });

  if (connection.status === 'connecting') return <Notice text={`Connecting to ${server}…`} />;
  if (connection.status === 'failed') return <Notice text={connection.message} back />;
  const showMatch = match && (match.phase !== 'ended' || room?.phase !== 'lobby');
  if (match && showMatch) {
    return <MatchView match={match} room={room} look={look} ghost={ghost} ping={state.ping} />;
  }
  if (!room) return <Notice text={state.error?.message ?? 'Joining the room…'} back />;
  return (
    <LobbyView
      room={room}
      sessionId={state.sessionId}
      ping={state.ping}
      last={match}
      error={state.error?.message ?? null}
    />
  );
}

function Notice({ text, back = false }: { text: string; back?: boolean }) {
  return (
    <Box flexDirection="column" marginTop={2}>
      <Text>{text}</Text>
      {back && <Text dimColor>Esc back</Text>}
    </Box>
  );
}
