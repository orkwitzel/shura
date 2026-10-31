import type { OnlineSession } from '@shura/client-core';
import { useSettingsStore } from '@shura/client-core/react';
import { lazy, Suspense, useState } from 'react';
import { useStore } from 'zustand';
import { Panel } from '@/components/panel';
import { roomPath } from '@/config/routes';
import { Lobby } from '@/features/lobby/components/lobby';
import { NicknameDialog } from '@/features/nickname/components/nickname-dialog';
import { matchOn } from '@/utils/playing-match';
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
 * then its lobby while it's in one, and the match screen while a match is on, played or spectated,
 * and once it ends, with the results over it until they're done with. N in the lobby asks for a
 * new nickname, which goes to the room and to the settings. A quick-match room has no lobby
 * (§9.4): its results stay until the rematch starts or you leave.
 */
export function RoomPage({ session, code }: RoomPageProps) {
  const room = useStore(session, (state) => state.room);
  const on = useStore(session, matchOn);
  const matchId = useStore(session, (state) => state.match?.matchId ?? null);
  const ended = useStore(session, (state) => state.match?.result != null);
  const settings = useSettingsStore();
  const [renaming, setRenaming] = useState(false);
  /** The match whose results the player is done with. */
  const [seen, setSeen] = useState<string | null>(null);

  if (!room || room.code !== code.toUpperCase()) {
    return (
      <main className={styles.page}>
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
  if (room.phase !== 'lobby' || room.hostId === undefined) return waiting;

  const nickname =
    [...room.players, ...room.spectators].find(({ id }) => id === session.getState().sessionId)
      ?.nickname ?? '';
  return (
    <main className={styles.page}>
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
