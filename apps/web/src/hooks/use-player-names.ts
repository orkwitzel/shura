import type { OnlineSession } from '@shura/client-core';
import { useRef } from 'react';
import { useStore } from 'zustand';

/**
 * Every nickname seen in `session`'s room, by player id, for as long as the component is mounted:
 * a player who leaves mid-match drops out of the room's list, but their board still needs its name.
 * A name changed in the lobby takes the old one's place.
 */
export function usePlayerNames(session: OnlineSession): ReadonlyMap<string, string> {
  const names = useRef(new Map<string, string>());
  const room = useStore(session, (state) => state.room);
  for (const { id, nickname } of [...(room?.players ?? []), ...(room?.spectators ?? [])]) {
    names.current.set(id, nickname);
  }
  return names.current;
}
