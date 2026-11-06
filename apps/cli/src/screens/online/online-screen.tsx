import {
  type Connect,
  createOnlineSession,
  errorText,
  type Fetch,
  handlingFrames,
  type OnlineSession,
  SKINS,
  THEMES,
  type TimerClock,
} from '@shura/client-core';
import { useSettings, useSettingsStore } from '@shura/client-core/react';
import { suggestNickname } from '@shura/protocol';
import { Box, Text } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { Look } from '../../board/look';
import { NicknamePrompt } from '../../components/nickname-prompt';
import { useScreenKeys } from '../../platform/input/use-screen-keys';
import type { InputOptions } from '../../platform/input/use-terminal-input';
import type { ColorMode } from '../../platform/terminal/color-mode';
import { useTerminalSize } from '../../platform/terminal/terminal-size';
import { LobbyView } from './lobby-view';
import { MatchView } from './match-view';
import type { OnlineStart } from './online-start';
import { PlayOnlineMenu } from './play-online-menu';
import { ResultsView } from './results-view';
import { WaitingView } from './waiting-view';

/** What the CLI prints on a version mismatch, after giving the terminal back (design §8.3). */
export const VERSION_MISMATCH_MESSAGE =
  'A new version of Shura is out. Update it to play online:\n  npm i -g shura@latest';

/** What online play needs from the platform: where to connect, and how. */
export interface OnlineNetwork {
  /** The server's HTTP origin: the API is under `/api` and the socket at `ws(s)://…/ws`. */
  readonly server: string;
  readonly clientVersion: string;
  readonly connect: Connect;
  /** The platform's `fetch`, for `POST /api/sessions`: Node's own unless a test gives one. */
  readonly fetch?: Fetch;
  /** The loop's clock, with the timers an online session's pings need. */
  readonly clock: TimerClock;
  /** `--name`: the nickname for this run, over the settings' and not saved (design §13.1). */
  readonly name?: string | undefined;
}

export interface OnlineScreenProps {
  readonly network: OnlineNetwork;
  /** `shura quick`, `create` or `join`: what to do as it opens. Without it, the menu. */
  readonly start?: OnlineStart | undefined;
  readonly colors: ColorMode;
  readonly input: InputOptions;
  /** Whether it takes keys: not while the enlarge message hides it. */
  readonly visible: boolean;
  /** Back to the main menu. */
  readonly onLeave: () => void;
  /** Quit the CLI with `code`, printing `message` once the terminal is back. */
  readonly onExit: (code: number, message: string) => void;
  /** An `auto` adapter has chosen (design §7.3). */
  readonly onInputChosen?: (choice: 'precise' | 'basic') => void;
}

/**
 * *Play online* (design §13.2, §13.3): the nickname prompt the first time, with no nickname saved
 * and no `--name` (design §13.1), then one online session from there until the player goes back to
 * the main menu: the *Play online* menu, the quick-match waiting screen, and a room's lobby,
 * matches, spectating and results. Leaving a room comes back to the *Play online* menu.
 */
export function OnlineScreen(props: OnlineScreenProps) {
  const { network, visible, onLeave } = props;
  const saved = useSettings((settings) => settings.nickname);
  const store = useSettingsStore();
  const [nickname, setNickname] = useState<string | null>(network.name ?? (saved || null));
  const [refused, setRefused] = useState<string | null>(null);

  if (nickname === null) {
    return (
      <NicknamePrompt
        initial={refused ?? suggestNickname()}
        fresh={refused === null}
        active={visible}
        clock={network.clock}
        onAccept={(chosen) => {
          if (network.name === undefined) {
            store.update({ nickname: chosen });
            store.save();
          }
          setNickname(chosen);
        }}
        onCancel={onLeave}
      />
    );
  }
  return (
    <SessionScreen
      key={nickname}
      {...props}
      nickname={nickname}
      onNicknameRefused={() => {
        setRefused(nickname);
        setNickname(null);
      }}
    />
  );
}

interface SessionScreenProps extends OnlineScreenProps {
  readonly nickname: string;
  /** The server refused the nickname: ask for another. */
  readonly onNicknameRefused: () => void;
}

/** Runs `start` on `session`. */
function run(session: OnlineSession, start: OnlineStart): void {
  if (start.action === 'quick') session.quickMatch();
  else if (start.action === 'create') session.createRoom(start.mode);
  else session.joinRoom(start.code);
}

function SessionScreen({
  network,
  start,
  nickname,
  colors,
  input,
  visible,
  onLeave,
  onExit,
  onInputChosen,
  onNicknameRefused,
}: SessionScreenProps) {
  const { server, clientVersion, connect, fetch, clock } = network;
  const { handling, ghost, theme, skin } = useSettings();
  const open = () =>
    createOnlineSession({
      serverUrl: server,
      connect,
      ...(fetch && { fetch }),
      clock,
      nickname,
      clientVersion,
      handling: handlingFrames(handling),
    });
  const [session, setSession] = useState(open);
  // One session from entering Play online to leaving it (design §13.1): closing it leaves the room.
  useEffect(() => () => session.close(), [session]);
  useEffect(() => session.setInput({ handling: handlingFrames(handling) }), [session, handling]);

  /** What was last asked for and hasn't come of it yet: a room, or the queue. */
  const [pending, setPending] = useState<OnlineStart | null>(start ?? null);
  /** Back in the menu by choice, whatever quick-match was doing. */
  const [away, setAway] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** The match whose results the player has seen. */
  const [seen, setSeen] = useState<string | null>(null);
  const connection = useStore(session, (state) => state.connection);
  const room = useStore(session, (state) => state.room);
  const match = useStore(session, (state) => state.match);
  const quickMatch = useStore(session, (state) => state.quickMatch);
  const error = useStore(session, (state) => state.error);
  // Every nickname seen, yours too: the results and a leaver's board outlast the room.
  const names = useStore(session, (state) => state.names);
  const size = useTerminalSize();
  const look: Look = useMemo(
    () => ({ colors, theme: THEMES[theme], skin: SKINS[skin] }),
    [colors, theme, skin],
  );

  // What was asked for goes once the session exists; again after a retry, if nothing came of it.
  useEffect(() => {
    if (pending) run(session, pending);
  }, [session]);
  useEffect(() => {
    if (room || quickMatch !== 'idle') setPending(null);
  }, [room, quickMatch]);
  // An error from the server answers the last thing asked: it shows in the menu, in plain words.
  useEffect(() => {
    if (!error) return;
    setMessage(errorText(error.code, error.message));
    setPending(null);
  }, [error]);
  useEffect(() => {
    if (connection.status !== 'failed') return;
    if (connection.reason === 'version_mismatch') onExit(1, VERSION_MISMATCH_MESSAGE);
    else if (connection.reason === 'nickname_invalid') onNicknameRefused();
  }, [connection]);

  const choose = (chosen: OnlineStart) => {
    setMessage(null);
    setAway(false);
    setPending(chosen);
    run(session, chosen);
  };
  const toMenu = () => setAway(true);
  const retry = () => {
    session.close();
    setSession(open());
  };

  const ended = match?.phase === 'ended' && match.result !== null;
  const showResults =
    connection.status !== 'failed' &&
    ended &&
    seen !== match.matchId &&
    (room !== null || quickMatch === 'opponentLeft') &&
    !away;
  if (showResults) {
    return (
      <ResultsView
        session={session}
        names={names}
        clock={clock}
        active={visible}
        onBack={() => setSeen(match.matchId)}
        onLeave={toMenu}
      />
    );
  }
  if (connection.status !== 'failed' && room) {
    if (match && match.phase !== 'ended') {
      return (
        <MatchView
          session={session}
          look={look}
          ghost={ghost}
          clock={clock}
          input={input}
          size={size}
          names={names}
          active={visible}
          onLeave={toMenu}
          {...(onInputChosen && { onInputChosen })}
        />
      );
    }
    if (room.quickMatch) {
      return <WaitingView session={session} clock={clock} active={visible} onBack={toMenu} />;
    }
    return (
      <LobbyView
        session={session}
        server={server}
        clock={clock}
        active={visible}
        onLeave={toMenu}
      />
    );
  }
  if (connection.status !== 'failed' && !away) {
    if (quickMatch !== 'idle' || pending?.action === 'quick') {
      return <WaitingView session={session} clock={clock} active={visible} onBack={toMenu} />;
    }
    if (pending) {
      return (
        <Pending
          text={pending.action === 'join' ? `Joining room ${pending.code}…` : 'Creating a room…'}
          active={visible}
          clock={clock}
          onBack={() => {
            setPending(null);
            setAway(true);
          }}
        />
      );
    }
  }
  return (
    <PlayOnlineMenu
      session={session}
      server={server}
      clock={clock}
      active={visible}
      message={message}
      onStart={choose}
      onRetry={retry}
      onBack={onLeave}
    />
  );
}

/** Waiting on the server for a room. Esc goes back to the menu. */
function Pending({
  text,
  active,
  clock,
  onBack,
}: {
  text: string;
  active: boolean;
  clock: TimerClock;
  onBack: () => void;
}) {
  useScreenKeys({ active, clock }, ({ key }, press) => {
    if (press && key.escape) onBack();
  });
  return (
    <Box flexDirection="column" marginTop={2}>
      <Text>{text}</Text>
      <Text dimColor>Esc back</Text>
    </Box>
  );
}
