import type { OnlineSession } from '@shura/client-core';
import { useEffect } from 'react';
import { showToast } from '@/lib/toasts';
import { roomChanges } from '../utils/room-changes';

/** Toasts each join, leave and host change in `session`'s room while mounted (design §13.2). */
export function useRoomToasts(session: OnlineSession): void {
  useEffect(
    () =>
      session.subscribe((state, before) => {
        if (state.room === before.room || !state.room) return;
        for (const said of roomChanges(before.room, state.room, state.sessionId)) showToast(said);
      }),
    [session],
  );
}
