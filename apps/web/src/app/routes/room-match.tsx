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
import { MatchResults } from '@/features/results/components/match-results';
import { useSound } from '@/features/sound/hooks/use-sound';
import { useGameKeys } from '@/hooks/use-game-keys';
import { usePlayerNames } from '@/hooks/use-player-names';
import { useSessionHandling } from '@/hooks/use-session-handling';
import styles from './room-match.module.css';

/** The CSS pixels a spectator's boards leave clear across the top, for the spectating banner. */
const SPECTATING_BANNER_SPACE = 104;

/** What the spectating banner says to someone watching a match they don't play in. */
const WATCHING_TEXT = 'you take a seat at the next lobby';

export interface RoomMatchProps {
  /** The online session, in a match it plays in or spectates, or one just ended. */
  readonly session: OnlineSession;
  /** Done with an ended match's results in a room with a code: back to the lobby. */
  readonly onResultsDone: () => void;
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
 * A room's match (design §13.2, Match, Spectating, Results): every board on the match canvas.
 *
 * - **Playing:** your HUD and callouts beside your board and the countdown over it, and your keys,
 *   sound and handling as in single-player. Esc or P, or the window losing focus, opens the online
 *   menu, which doesn't pause; *Leave match* leaves the match (in a quick-match room, the room).
 *   Once you're out your board greys and a banner says you're spectating and why ("You lagged
 *   out" after coming back too late, §10.2), with *Leave* (Esc) out of the room. "Reconnecting…"
 *   shows over the HUD while the connection is down.
 * - **Spectating** a match you don't play in: every board the same size in a grid, from the
 *   snapshot, under a banner saying you take a seat at the next lobby, with *Leave* (Esc).
 * - **Ended:** the results over the boards, until they're done with.
 *
 * Loaded apart, with Pixi.
 */
export function RoomMatch({ session, onResultsDone }: RoomMatchProps) {
  const names = usePlayerNames(session);
  const [menuOpen, setMenuOpen] = useState(false);
  const me = useStore(session, (state) => state.match?.playerId ?? null);
  const myOut = useStore(session, (state) => mine(state)?.out ?? null);
  const result = useStore(session, (state) => state.match?.result ?? null);
  const quickMatch = useStore(session, (state) => state.room?.hostId === undefined);
  const roomCode = useStore(session, (state) => state.room?.code ?? '');
  const reconnecting = useStore(session, (state) => state.connection.status === 'reconnecting');
  const countdown = useStore(session, (state) => {
    const game = mine(state);
    return state.match && game ? countdownLabel({ ...state.match, engine: game.engine }) : null;
  });
  // Re-renders as players go out, for their names and out labels.
  useStore(session, outs);
  const match = session.getState().match;
  const playing = me !== null && myOut === null && result === null;

  useSessionHandling(session);
  useSound(session);
  useGameKeys({
    game: session,
    now: session.now,
    acceptKeys: playing && !menuOpen,
    onMenu: () => setMenuOpen(true),
    onAway: () => {
      const state = session.getState();
      if (state.match?.phase !== 'ended' && mine(state)?.out === null) setMenuOpen(true);
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
  const banner =
    result !== null ? null : me === null ? WATCHING_TEXT : myOut && youOutText(myOut.reason);

  return (
    <main className={styles.match}>
      <MatchCanvas
        session={session}
        top={banner ? SPECTATING_BANNER_SPACE : 0}
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
      {banner && <SpectatingBanner detail={banner} onLeave={session.leaveRoom} />}
      <MatchMenu
        open={menuOpen && playing}
        onBack={() => setMenuOpen(false)}
        onLeave={leaveMatch}
      />
      {result && (
        <MatchResults
          result={result}
          you={me}
          name={(playerId) => names.get(playerId) ?? '?'}
          roomCode={roomCode}
          quickMatch={quickMatch}
          onBack={onResultsDone}
          onRematch={session.rematch}
          onLeave={session.leaveRoom}
        />
      )}
    </main>
  );
}
