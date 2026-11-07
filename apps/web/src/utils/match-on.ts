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
 * Whether your quick-match opponent left a match that has its results, breaking the room up
 * (design §9.4): you're out of the room, and the results still show, with only *Leave*.
 */
export function opponentLeftResults({ room, quickMatch, match }: OnlineSessionState): boolean {
  return room === null && quickMatch === 'opponentLeft' && match?.result != null;
}
