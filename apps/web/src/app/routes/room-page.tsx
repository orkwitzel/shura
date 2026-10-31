import type { OnlineSession } from '@shura/client-core';
import { useSettingsStore } from '@shura/client-core/react';
import { useState } from 'react';
import { useStore } from 'zustand';
import { Panel } from '@/components/panel';
import { roomPath } from '@/config/routes';
import { Lobby } from '@/features/lobby/components/lobby';
import { NicknameDialog } from '@/features/nickname/components/nickname-dialog';
import styles from './room-page.module.css';

export interface RoomPageProps {
  readonly session: OnlineSession;
  /** The code in the address, as typed. */
  readonly code: string;
}

/**
 * A room at `/r/:code` (design §13.2, Online): "Joining room…" until the room is the session's,
 * then its lobby while it's in one. N in the lobby asks for a new nickname, which goes to the room
 * and to the settings. A quick-match room has no lobby (§9.4), and a match on is the match
 * screen's (#69): until then, this page only says so.
 */
export function RoomPage({ session, code }: RoomPageProps) {
  const room = useStore(session, (state) => state.room);
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

  if (room.phase !== 'lobby' || room.hostId === undefined) {
    // The match screen (#69) goes here, with spectating and results (#70).
    return (
      <main className={styles.page}>
        <Panel>
          <p role="status" className={styles.status}>
            {room.phase === 'lobby' ? 'Match starting…' : 'Match in progress'}
          </p>
        </Panel>
      </main>
    );
  }

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
