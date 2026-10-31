import {
  countdownLabel,
  type OnlineSession,
  type OnlineSessionState,
  placeOf,
} from '@shura/client-core';
import { useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { MatchCanvas } from '@/features/board/components/match-canvas';
import { Callouts } from '@/features/callouts/components/callouts';
import { ReconnectingBanner } from '@/features/connection/components/reconnecting-banner';
import { Countdown } from '@/features/countdown/components/countdown';
import { MatchHud } from '@/features/hud/components/match-hud';
import { MatchMenu } from '@/features/match/components/match-menu';
import { OutLabel } from '@/features/match/components/out-label';
import { PlayerName } from '@/features/match/components/player-name';
import { SpectatingBanner } from '@/features/match/components/spectating-banner';
import { youOutText } from '@/features/match/utils/out-text';
import { useSound } from '@/features/sound/hooks/use-sound';
import { useGameKeys } from '@/hooks/use-game-keys';
import { usePlayerNames } from '@/hooks/use-player-names';
import { useSessionHandling } from '@/hooks/use-session-handling';
import styles from './room-match.module.css';

export interface RoomMatchProps {
  /** The online session, in a match it plays in. */
  readonly session: OnlineSession;
}

/** Your own game in the session's match. */
const mine = ({ match }: OnlineSessionState) =>
  match?.players.find(({ playerId }) => playerId === match.playerId);

/** Who is out so far, how and when, and the result: what the names and out labels show. */
const outs = ({ match }: OnlineSessionState) =>
  [
    ...(match?.players ?? []).map(({ playerId, out }) =>
      out ? `${playerId}:${out.reason}:${out.frame}` : '',
    ),
    match?.result ? 'ended' : '',
  ].join(' ');

/**
 * A room's match, for a player in it (design §13.2, Match): every board on the match canvas, with
 * your HUD and callouts beside yours and the countdown over it, and your keys, sound and handling
 * as in single-player. Esc or P, or the window losing focus, opens the online menu, which doesn't
 * pause; *Leave match* leaves the match (in a quick-match room, the room). Once you're out your
 * board greys and a banner says you're spectating, with *Leave* (Esc) out of the room.
 * "Reconnecting…" shows over the HUD while the connection is down. Loaded apart, with Pixi.
 */
export function RoomMatch({ session }: RoomMatchProps) {
  const names = usePlayerNames(session);
  const [menuOpen, setMenuOpen] = useState(false);
  const me = useStore(session, (state) => state.match?.playerId ?? null);
  const myOut = useStore(session, (state) => mine(state)?.out ?? null);
  const quickMatch = useStore(session, (state) => state.room?.hostId === undefined);
  const reconnecting = useStore(session, (state) => state.connection.status === 'reconnecting');
  const countdown = useStore(session, (state) => {
    const game = mine(state);
    return state.match && game ? countdownLabel({ ...state.match, engine: game.engine }) : null;
  });
  // Re-renders as players go out, for their names and out labels.
  useStore(session, outs);
  const match = session.getState().match;
  const playing = myOut === null;

  useSessionHandling(session);
  useSound(session);
  useGameKeys({
    game: session,
    // The online clock's time (lib/online-clock), which the session's loop runs on.
    now: () => performance.now(),
    acceptKeys: playing && !menuOpen,
    onMenu: () => setMenuOpen(true),
    onAway: () => {
      if (session.getState().match && mine(session.getState())?.out === null) setMenuOpen(true);
    },
  });
  // The callouts follow your own game's events: an online game never starts again.
  const events = useMemo(() => ({ onEvents: session.onEvents }), [session]);

  const leaveMatch = () => {
    setMenuOpen(false);
    if (quickMatch) session.leaveRoom();
    else session.leaveMatch();
  };
  const outOf = (playerId: string) =>
    match?.players.find((game) => game.playerId === playerId)?.out ?? null;
  const outLabel = (playerId: string) => {
    const out = outOf(playerId);
    return out && match && <OutLabel place={placeOf(match, playerId)} reason={out.reason} />;
  };

  return (
    <main className={styles.match}>
      <MatchCanvas
        session={session}
        name={(playerId) => (
          <PlayerName
            name={names.get(playerId) ?? '?'}
            you={playerId === me}
            out={outOf(playerId) !== null}
          />
        )}
        opponentOverlay={outLabel}
        overlay={me && myOut ? outLabel(me) : <Countdown label={countdown} />}
        aside={
          <div className={styles.aside}>
            {reconnecting && <ReconnectingBanner placement="hud" />}
            <MatchHud session={session} />
            <Callouts game={events} />
          </div>
        }
      />
      {myOut && <SpectatingBanner detail={youOutText(myOut.reason)} onLeave={session.leaveRoom} />}
      <MatchMenu
        open={menuOpen && playing}
        onBack={() => setMenuOpen(false)}
        onLeave={leaveMatch}
      />
    </main>
  );
}
