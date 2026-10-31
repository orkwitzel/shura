import type { OnlineSession } from '@shura/client-core';
import { parseRoomCode } from '@shura/protocol';
import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useStore } from 'zustand';
import { ROUTES, roomCodeIn, roomPath } from '@/config/routes';
import { showToast } from '@/lib/toasts';

const UNKNOWN_ROOM = 'No room with that code';

/**
 * Keeps the address on the room (design §13.2, Links): a player in a room is on its `/r/:code`, so
 * the address bar holds its link.
 *
 * - A room you enter (created, joined, matched) takes you to its route.
 * - A room you leave, or that goes away (`opponentLeft`, `room_not_found`), takes you to `/online`.
 * - Going to another route yourself (Back) leaves the room.
 * - A room's route without its room (a link opened, a reload) joins it once connected. A code that
 *   can't be one, or that the server doesn't know, says "No room with that code" and goes to
 *   `/online`. A session that comes back in another room than the route's leaves it for the
 *   route's.
 *
 * The server's other errors after the welcome show as toasts.
 */
export function useRoomAddress(session: OnlineSession): void {
  const [location, navigate] = useLocation();
  const room = useStore(session, (state) => state.room?.code ?? null);
  const connected = useStore(session, (state) => state.connection.status === 'connected');
  const before = useRef<{ location: string; room: string | null }>({ location, room: null });
  /** The code this route has asked to join, so it asks once. */
  const asked = useRef<string | null>(null);
  /** The code this route last asked to join, for the answer that says you're already in it. */
  const joined = useRef<string | null>(null);

  useEffect(() => {
    const was = before.current;
    before.current = { location, room };
    const at = roomCodeIn(location);
    if (location !== was.location) {
      asked.current = null;
      joined.current = null;
    }
    if (room !== null) {
      if (room !== was.room && at !== null && parseRoomCode(at) !== room) {
        // A room came that isn't the one this route names: a session restored into its old room
        // (design §10.2) while the player opened another room's link. The link wins.
        asked.current = null;
        session.leaveRoom();
      } else if (room !== was.room) {
        if (at !== room) navigate(roomPath(room));
      } else if (at !== room && location !== was.location) {
        session.leaveRoom();
      }
      return;
    }
    if (was.room !== null && at === was.room) {
      navigate(ROUTES.online, { replace: true });
      return;
    }
    if (at === null || !connected || asked.current === at) return;
    const code = parseRoomCode(at);
    if (code === undefined) {
      showToast(UNKNOWN_ROOM, 'alert');
      navigate(ROUTES.online, { replace: true });
    } else if (code !== at) {
      navigate(roomPath(code), { replace: true });
    } else {
      asked.current = code;
      joined.current = code;
      session.joinRoom(code);
    }
  }, [session, location, room, connected, navigate]);

  useEffect(
    () =>
      session.subscribe((state, previous) => {
        const { error } = state;
        if (!error || error === previous.error) return;
        if (error.code === 'room_not_found' && !state.room) {
          showToast(UNKNOWN_ROOM, 'alert');
          navigate(ROUTES.online, { replace: true });
          return;
        }
        // A join answered with "leave your room first" outside a room, or in the room it asked
        // for, comes from a session the server has just put back in its room (a reload, design
        // §10.2): its `roomState` is on the way, or here.
        const restored = !state.room || state.room.code === joined.current;
        if (error.code === 'wrong_phase' && restored) return;
        showToast(error.message, 'alert');
      }),
    [session, navigate],
  );
}
