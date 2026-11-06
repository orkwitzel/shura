import { type OnlineSession, roomChanges } from '@shura/client-core';
import { useEffect } from 'react';
import { showNotice } from '@/lib/notices';
import { roomChangeText } from '../utils/room-change-text';

/**
 * Shows a notice for each join, leave and host change in `session`'s room while mounted (design
 * §13.2).
 */
export function useRoomNotices(session: OnlineSession): void {
  useEffect(
    () =>
      session.subscribe((state, before) => {
        if (state.room === before.room || !state.room) return;
        for (const change of roomChanges(before.room, state.room, state.sessionId)) {
          showNotice(roomChangeText(change));
        }
      }),
    [session],
  );
}
