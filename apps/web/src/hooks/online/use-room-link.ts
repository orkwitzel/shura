import type { OnlineSession } from '@shura/client-core';
import { type RoomLookup, useRoomLookup } from '@shura/client-core/react';
import { parseRoomCode } from '@shura/protocol';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'wouter';
import { UNKNOWN_ROOM } from '@/config/online';
import { ROUTES, roomCodeIn, roomPath } from '@/config/routes';
import { showNotice } from '@/lib/notices';

/**
 * Checks the room a room's route names (design §13.2, Links) with `useRoomLookup`, before the
 * nickname prompt and before joining: what the server says of it, which the join waits for. A code
 * that can't be one, or that no room has, says "No room with that code" and goes to `/online`. A
 * code typed in lowercase goes to its uppercase route. It's `idle` off a room's route, and on the
 * route of the room `session` is already in (one just created or matched): there's nothing to
 * check there.
 */
export function useRoomLink(session: OnlineSession | null): RoomLookup {
  const [location, navigate] = useLocation();
  const inRoom = useSyncExternalStore(
    useCallback((listener: () => void) => session?.subscribe(listener) ?? (() => {}), [session]),
    () => session?.getState().room?.code ?? null,
  );
  const at = roomCodeIn(location);
  const code = at === null ? null : (parseRoomCode(at) ?? null);
  const lookup = useRoomLookup(code === inRoom ? null : code);
  const unknown =
    (at !== null && code === null) ||
    (lookup.status === 'failed' && lookup.error.code === 'room_not_found');

  useEffect(() => {
    if (code !== null && at !== code) navigate(roomPath(code), { replace: true });
  }, [at, code, navigate]);

  useEffect(() => {
    if (!unknown) return;
    showNotice(UNKNOWN_ROOM, 'alert', 'unknown-room');
    navigate(ROUTES.online, { replace: true });
  }, [unknown, navigate]);

  return lookup;
}
