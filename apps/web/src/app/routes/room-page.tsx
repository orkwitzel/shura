import type { OnlineSession } from '@shura/client-core';
import { useSettingsStore } from '@shura/client-core/react';
import { lazy, Suspense, useState } from 'react';
import { useLocation } from 'wouter';
import { useStore } from 'zustand';
import { Panel } from '@/components/panel';
import { ROUTES, roomPath } from '@/config/routes';
import { ReconnectingBanner } from '@/features/connection/components/reconnecting-banner';
import { Lobby } from '@/features/lobby/components/lobby';
import { NicknameDialog } from '@/features/nickname/components/nickname-dialog';
import { matchOn, opponentLeftResults } from '@/utils/match-on';
import styles from './room-page.module.css';

// The match brings Pixi, so it loads apart, when a match first starts.
const RoomMatch = lazy(async () => ({ default: (await import('./room-match')).RoomMatch }));

export interface RoomPageProps {
  readonly session: OnlineSession;
  /** The code in the address, as typed. */
  readonly code: string;
}

/**
 * A room at `/r/:code` (design §13.2, Online): "Joining room…" until the room is the session's,
 * then its lobby while it's in one, and the match screen while a match is on, played or
 * spectated, and once it ends, with the results over it until they're done with: the room is back
 * in its lobby by then (§10.1). N in the lobby asks for a new nickname, which goes to the room and
 * to the settings. A quick-match room has no lobby (§9.4): its results stay until the rematch
 * starts or you leave, and when the opponent left mid-match they stay, with only *Leave*, which
 * goes to `/online`. "Reconnecting…" shows across the top, except on the match screen, which
 * places it itself.
 */
export function RoomPage({ session, code }: RoomPageProps) {
  const [, navigate] = useLocation();
  const room = useStore(session, (state) => state.room);
  const reconnecting = useStore(session, (state) => state.connection.status === 'reconnecting');
  const opponentLeft = useStore(session, opponentLeftResults);
  const on = useStore(session, matchOn);
  const matchId = useStore(session, (state) => state.match?.matchId ?? null);
  const ended = useStore(session, (state) => state.match?.result != null);
  // Your nickname as the room has it, after a rename too.
  const nickname = useStore(session, (state) => state.nickname ?? '');
  const settings = useSettingsStore();
  const [renaming, setRenaming] = useState(false);
  /** The match whose results the player is done with. */
  const [seen, setSeen] = useState<string | null>(null);

  if (!room && opponentLeft && matchId !== null && seen !== matchId) {
    return (
      <Suspense fallback={null}>
        <RoomMatch
          key={matchId}
          session={session}
          onResultsDone={() => {
            setSeen(matchId);
            navigate(ROUTES.online, { replace: true });
          }}
        />
      </Suspense>
    );
  }
  const banner = reconnecting && <ReconnectingBanner />;
  if (!room || room.code !== code.toUpperCase()) {
    return (
      <main className={styles.page}>
        {banner}
        <Panel>
          <p role="status" className={styles.status}>
            Joining room {code.toUpperCase()}…
          </p>
        </Panel>
      </main>
    );
  }

  const waiting = (
    <main className={styles.page}>
      {banner}
      <Panel>
        <p role="status" className={styles.status}>
          {room.phase === 'lobby' ? 'Match starting…' : 'Match in progress'}
        </p>
      </Panel>
    </main>
  );
  if (matchId !== null && (on || (ended && seen !== matchId))) {
    return (
      <Suspense fallback={waiting}>
        <RoomMatch key={matchId} session={session} onResultsDone={() => setSeen(matchId)} />
      </Suspense>
    );
  }
  if (room.phase !== 'lobby' || room.quickMatch) return waiting;

  return (
    <main className={styles.page}>
      {banner}
      <Panel className={styles.panel}>
        <Lobby
          session={session}
          link={`${window.location.origin}${roomPath(room.code)}`}
          acceptKeys={!renaming}
          onChangeNickname={() => setRenaming(true)}
        />
      </Panel>
      <NicknameDialog
        open={renaming}
        title="Change nickname"
        initial={nickname}
        onClose={() => setRenaming(false)}
        onSave={(chosen) => {
          settings.update({ nickname: chosen });
          settings.save();
          session.setNickname(chosen);
          setRenaming(false);
        }}
      />
    </main>
  );
}
