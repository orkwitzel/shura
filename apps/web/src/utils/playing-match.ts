import type { OnlineSessionState } from '@shura/client-core';

/**
 * Whether a match is on in your room (design §13.2, Match, Spectating): counting down or under way,
 * whether you play in it or spectate it. Once a match has ended its room is back in the lobby, and
 * the results are a screen of their own over it.
 */
export function matchOn({ room, match }: OnlineSessionState): boolean {
  return room !== null && room.phase !== 'lobby' && match !== null && match.phase !== 'ended';
}

/**
 * Whether you play in the match on in your room, out or not (design §13.2, Match): its
 * "Reconnecting…" shows over your HUD. Watching one you don't play in is spectating.
 */
export function playingMatch(state: OnlineSessionState): boolean {
  return matchOn(state) && state.match?.playerId !== null;
}
