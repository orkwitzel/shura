import type { OnlineSessionState } from '@shura/client-core';

/**
 * Whether the room's match screen is up (design §13.2, Match): a match counting down or under way
 * in your room, that you play in, out or not. Watching one you don't play in is spectating, and a
 * match that has ended has gone back to the lobby.
 */
export function playingMatch({ room, match }: OnlineSessionState): boolean {
  return (
    room !== null &&
    room.phase !== 'lobby' &&
    match !== null &&
    match.playerId !== null &&
    match.phase !== 'ended'
  );
}
