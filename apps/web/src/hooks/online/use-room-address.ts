import { errorText, type OnlineSession } from '@shura/client-core';
import type { RoomLookup } from '@shura/client-core/react';
import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useStore } from 'zustand';
import { UNKNOWN_ROOM } from '@/config/online';
import { ROUTES, roomCodeIn, roomPath } from '@/config/routes';
import { showNotice } from '@/lib/notices';
import { opponentLeftResults } from '@/utils/match-on';

/**
 * Keeps the address on the room (design §13.2, Links): a player in a room is on its `/r/:code`, so
 * the address bar holds its link.
 *
 * - A room you enter (created, joined, matched) takes you to its route.
 * - A room you leave, or that goes away (`opponentLeft`, `room_not_found`), takes you to `/online`,
 *   except a quick-match room whose opponent left a match: its results stay on the route until
 *   you're done with them (the page goes to `/online` then).
 * - Going to another route yourself (Back) leaves the room.
 * - A room's route without its room (a link opened, a reload) joins it once connected and once
 *   `link` (the route's `useRoomLink`) has found the room. A session that comes back in another
 *   room than the route's leaves it for the route's.
 *
 * The server's other errors after the welcome show as notices, in `errorText`'s words. A join the
 * server refuses (the room went away since the lookup, or is full) goes back to `/online`.
 */
export function useRoomAddress(session: OnlineSession, link: RoomLookup): void {
  const [location, navigate] = useLocation();
  const room = useStore(session, (state) => state.room?.code ?? null);
  const connected = useStore(session, (state) => state.connection.status === 'connected');
  const resultsLeft = useStore(session, opponentLeftResults);
  const before = useRef<{ location: string; room: string | null }>({ location, room: null });
  /** The code this route has asked to join, so it asks once. */
  const asked = useRef<string | null>(null);
  /** The code this route last asked to join, for the answer that says you're already in it. */
  const joined = useRef<string | null>(null);
  /** The code of the quick-match room whose results stay on its route after the opponent left. */
  const held = useRef<string | null>(null);
  const found = link.status === 'found' || (link.status === 'failed' && !missing(link));

  useEffect(() => {
    const was = before.current;
    before.current = { location, room };
    const at = roomCodeIn(location);
    if (location !== was.location) {
      asked.current = null;
      joined.current = null;
    }
    if (room !== null) {
      if (room !== was.room && at !== null && at !== room) {
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
      // The results of a match whose quick-match opponent left stay up, with nothing to join.
      if (resultsLeft) held.current = at;
      else navigate(ROUTES.online, { replace: true });
      return;
    }
    if (resultsLeft && at === held.current) return;
    // `useRoomLink` sends a code that isn't one, or isn't written as one, elsewhere first.
    if (at === null || !connected || !found || asked.current === at) return;
    asked.current = at;
    joined.current = at;
    session.joinRoom(at);
  }, [session, location, room, connected, found, resultsLeft, navigate]);

  useEffect(
    () =>
      session.subscribe((state, previous) => {
        const { error } = state;
        if (!error || error === previous.error) return;
        if (error.code === 'room_not_found' && !state.room) {
          showNotice(UNKNOWN_ROOM, 'alert', 'unknown-room');
          navigate(ROUTES.online, { replace: true });
          return;
        }
        // A join answered with "leave your room first" outside a room, or in the room it asked
        // for, comes from a session the server has just put back in its room (a reload, design
        // §10.2): its `roomState` is on the way, or here.
        const restored = !state.room || state.room.code === joined.current;
        if (error.code === 'wrong_phase' && restored) return;
        showNotice(errorText(error.code, error.message), 'alert');
        // A link's join refused: there's no room to wait on here.
        if (!state.room && asked.current !== null) {
          asked.current = null;
          navigate(ROUTES.online, { replace: true });
        }
      }),
    [session, navigate],
  );
}

/** Whether a lookup failed because there's no such room. */
const missing = (link: RoomLookup & { status: 'failed' }) => link.error.code === 'room_not_found';
