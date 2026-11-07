import {
  kindOf,
  lobbyRole,
  matchCountdownLabel,
  nicknameOf,
  type OnlineSession,
  rosterEntryOf,
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
import { spectatingText } from '@/features/match/utils/out-text';
import { MatchResults } from '@/features/results/components/match-results';
import { useSound } from '@/features/sound/hooks/use-sound';
import { useGameKeys } from '@/hooks/use-game-keys';
import { useSessionHandling } from '@/hooks/use-session-handling';
import { opponentLeftResults } from '@/utils/match-on';
import styles from './room-match.module.css';

/** The CSS pixels the boards leave clear across the top, for the spectating banner. */
const SPECTATING_BANNER_SPACE = 104;

export interface RoomMatchProps {
  /** The online session, in a match it plays in or spectates, or one just ended. */
  readonly session: OnlineSession;
  /** Done with an ended match's results in a room with a code: back to the lobby. */
  readonly onResultsDone: () => void;
}

/**
 * A room's match (design §13.2, Match, Spectating, Results): every board on the match canvas.
 *
 * - **Playing:** your HUD and callouts beside your board and the countdown over it, and your keys,
 *   sound and handling as in single-player. Esc or P, or the window losing focus, opens the online
 *   menu, which doesn't pause; *Leave match* leaves the room (design §7.4). Once you're out your
 *   board greys and a banner says you're spectating and why ("You lagged out" after coming back
 *   too late, §10.2), with *Leave* (Esc) out of the room. "Reconnecting…" shows over the HUD while
 *   the connection is down.
 * - **Spectating** a match you don't play in: every board the same size in a grid, from the
 *   snapshot, under a banner saying you take a seat at the next lobby, with *Leave* (Esc).
 * - **Ended:** the results over the boards, until they're done with. When your quick-match
 *   opponent left mid-match, you're out of the room already: only *Leave*, which is done with them.
 *
 * Loaded apart, with Pixi.
 */
export function RoomMatch({ session, onResultsDone }: RoomMatchProps) {
  // Every nickname seen: a player who leaves mid-match keeps theirs on their board.
  const names = useStore(session, (state) => state.names);
  const [menuOpen, setMenuOpen] = useState(false);
  const me = useStore(session, (state) => state.match?.playerId ?? null);
  const myOut = useStore(session, (state) => state.match?.me?.out ?? null);
  const result = useStore(session, (state) => state.match?.result ?? null);
  const quickMatch = useStore(session, (state) => state.room?.quickMatch === true);
  // Your quick-match opponent left mid-match: you're out of the room, with only *Leave*.
  const opponentLeft = useStore(session, opponentLeftResults);
  const roomCode = useStore(session, (state) => state.room?.code ?? '');
  const room = useStore(session, (state) => state.room);
  // The server marks you ready once you've asked for the rematch (design §9.4).
  const rematchAsked = useStore(session, ({ room, sessionId }) => {
    const role = room ? lobbyRole(room, sessionId) : null;
    return role?.kind === 'player' && role.ready;
  });
  const reconnecting = useStore(session, (state) => state.connection.status === 'reconnecting');
  const countdown = useStore(session, (state) =>
    state.match ? matchCountdownLabel(state.match) : null,
  );
  // Who is out so far, how and when, and their place: a new roster only as someone goes out or
  // the match ends, for the names and out labels.
  const roster = useStore(session, (state) => state.match?.roster ?? []);
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
      if (state.match?.phase !== 'ended' && state.match?.me?.out === null) setMenuOpen(true);
    },
  });
  // The callouts follow your own game's events: an online game never starts again.
  const events = useMemo(() => ({ onEvents: session.onEvents }), [session]);

  const leaveMatch = () => {
    setMenuOpen(false);
    session.leaveRoom();
  };
  const entryOf = (playerId: string) => rosterEntryOf({ roster }, playerId);
  const outLabel = (playerId: string) => <OutLabel entry={entryOf(playerId)} />;
  const banner = spectatingText({ playing: me !== null, out: myOut, ended: result !== null });
  // "Reconnecting…" shows once (design §13.2): over your HUD if you have a board, else in the
  // spectating banner, else (a spectator at the results) across the top.
  const reconnectingAt = !reconnecting ? null : me !== null ? 'hud' : banner ? 'banner' : 'top';

  return (
    <main className={styles.match}>
      <MatchCanvas
        session={session}
        top={banner ? SPECTATING_BANNER_SPACE : 0}
        name={(playerId: string) => (
          <PlayerName
            name={nicknameOf(names, playerId)}
            you={playerId === me}
            out={entryOf(playerId)?.out != null}
          />
        )}
        opponentOverlay={outLabel}
        overlay={me && myOut ? outLabel(me) : <Countdown label={countdown} />}
        aside={
          <div className={styles.aside}>
            {reconnectingAt === 'hud' && <ReconnectingBanner placement="hud" />}
            <MatchHud session={session} />
            <Callouts game={events} />
          </div>
        }
      />
      {banner && (
        <SpectatingBanner
          detail={banner}
          status={reconnectingAt === 'banner' && <ReconnectingBanner placement="inline" />}
          onLeave={session.leaveRoom}
        />
      )}
      {reconnectingAt === 'top' && <ReconnectingBanner />}
      <MatchMenu
        open={menuOpen && playing}
        onBack={() => setMenuOpen(false)}
        onLeave={leaveMatch}
      />
      {result && (
        <MatchResults
          result={result}
          you={me}
          name={(playerId) => nicknameOf(names, playerId)}
          kind={(playerId) => kindOf(room, playerId)}
          roomCode={roomCode}
          quickMatch={quickMatch}
          opponentLeft={opponentLeft}
          rematchAsked={rematchAsked}
          onBack={onResultsDone}
          onRematch={session.rematch}
          onLeave={opponentLeft ? onResultsDone : session.leaveRoom}
        />
      )}
    </main>
  );
}
