import { matchCountdownLabel, type OnlineSession } from '@shura/client-core';
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
import { useSessionHandling } from '@/hooks/use-session-handling';
import styles from './room-match.module.css';

/** The CSS pixels the boards leave clear across the top, for the spectating banner. */
const SPECTATING_BANNER_SPACE = 104;

export interface RoomMatchProps {
  /** The online session, in a match it plays in. */
  readonly session: OnlineSession;
}

/**
 * A room's match (design §13.2, Match): every board on the match canvas, with your HUD and
 * callouts beside your board and the countdown over it, and your keys, sound and handling as in
 * single-player. Esc or P, or the window losing focus, opens the online menu, which doesn't pause;
 * *Leave match* leaves the room (design §7.4). Once you're out your board greys and a banner says
 * you're spectating and why, with *Leave* (Esc) out of the room. "Reconnecting…" shows over the HUD
 * while the connection is down.
 *
 * Loaded apart, with Pixi.
 */
export function RoomMatch({ session }: RoomMatchProps) {
  // Every nickname seen: a player who leaves mid-match keeps theirs on their board.
  const names = useStore(session, (state) => state.names);
  const [menuOpen, setMenuOpen] = useState(false);
  const me = useStore(session, (state) => state.match?.playerId ?? null);
  const myOut = useStore(session, (state) => state.match?.me?.out ?? null);
  const ended = useStore(session, (state) => state.match?.phase === 'ended');
  const reconnecting = useStore(session, (state) => state.connection.status === 'reconnecting');
  const countdown = useStore(session, (state) =>
    state.match ? matchCountdownLabel(state.match) : null,
  );
  // Who is out so far, how and when, and their place: a new roster only as someone goes out or
  // the match ends, for the names and out labels.
  const roster = useStore(session, (state) => state.match?.roster ?? []);
  const playing = me !== null && myOut === null && !ended;

  useSessionHandling(session);
  useSound(session);
  useGameKeys({
    game: session,
    now: session.now,
    acceptKeys: playing && !menuOpen,
    onMenu: () => setMenuOpen(true),
    onAway: () => {
      const state = session.getState();
      if (state.match?.phase !== 'ended' && state.match?.me?.out === null) setMenuOpen(true);
    },
  });
  // The callouts follow your own game's events: an online game never starts again.
  const events = useMemo(() => ({ onEvents: session.onEvents }), [session]);

  const leaveMatch = () => {
    setMenuOpen(false);
    session.leaveRoom();
  };
  const entryOf = (playerId: string) => roster.find((entry) => entry.playerId === playerId);
  const outLabel = (playerId: string) => {
    const entry = entryOf(playerId);
    return entry?.out && <OutLabel place={entry.place} reason={entry.out.reason} />;
  };
  const banner = myOut && !ended ? youOutText(myOut.reason) : null;

  return (
    <main className={styles.match}>
      <MatchCanvas
        session={session}
        top={banner ? SPECTATING_BANNER_SPACE : 0}
        name={(playerId: string) => (
          <PlayerName
            name={names.get(playerId) ?? '?'}
            you={playerId === me}
            out={entryOf(playerId)?.out != null}
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
    </main>
  );
}
