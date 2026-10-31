import type { OnlineSessionState } from '@shura/client-core';

/**
 * Whether a match is on in your room (design §13.2, Match, Spectating): counting down or under way,
 * whether you play in it or spectate it. A match that has ended has gone back to the lobby.
 */
export function matchOn({ room, match }: OnlineSessionState): boolean {
  return room !== null && room.phase !== 'lobby' && match !== null && match.phase !== 'ended';
}

/**
 * Whether the room's match screen is up for a player (design §13.2, Match): a match on in your
 * room that you play in, out or not. Watching one you don't play in is spectating.
 */
export function playingMatch(state: OnlineSessionState): boolean {
  return matchOn(state) && state.match?.playerId !== null;
}
