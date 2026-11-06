import type { OnlineSession } from '@shura/client-core';
import { useSettingsStore } from '@shura/client-core/react';
import { lazy, Suspense, useState } from 'react';
import { useStore } from 'zustand';
import { Panel } from '@/components/panel';
import { roomPath } from '@/config/routes';
import { Lobby } from '@/features/lobby/components/lobby';
import { NicknameDialog } from '@/features/nickname/components/nickname-dialog';
import { playingMatch } from '@/utils/playing-match';
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
 * then its lobby while it's in one, and the match screen while a match you play in is on, out or
 * not. N in the lobby asks for a new nickname, which goes to the room and to the settings. A
 * quick-match room has no lobby (§9.4), and a match you don't play in shows as in progress.
 */
export function RoomPage({ session, code }: RoomPageProps) {
  const room = useStore(session, (state) => state.room);
  const playing = useStore(session, playingMatch);
  const matchId = useStore(session, (state) => state.match?.matchId ?? null);
  // Your nickname as the room has it, after a rename too.
  const nickname = useStore(session, (state) => state.nickname ?? '');
  const settings = useSettingsStore();
  const [renaming, setRenaming] = useState(false);

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
  if (playing && matchId !== null) {
    return (
      <Suspense fallback={waiting}>
        <RoomMatch key={matchId} session={session} />
      </Suspense>
    );
  }
  if (room.phase !== 'lobby' || room.quickMatch) return waiting;

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
