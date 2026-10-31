import type { OnlineMatchState } from '@shura/client-core';

/** 1st, 2nd, 3rd, 4th… */
export function ordinal(place: number): string {
  const tens = place % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] ?? 'th');
  return `${place}${suffix}`;
}

/** How a player went out, in words (design §13.2). */
export const OUT_WORDS = {
  toppedOut: 'topped out',
  laggedOut: 'lagged out',
  removed: 'removed',
  left: 'left',
} as const;

/**
 * A player's place: the server's, once the match has ended, and before that the one their out frame
 * gives so far (design §10.1): one more than the players still in and those out at a later frame,
 * shared with anyone out at the same frame. `null` for a player still in.
 */
export function placeOf(match: OnlineMatchState, playerId: string): number | null {
  const settled = match.result?.placements.find((placement) => placement.playerId === playerId);
  if (settled) return settled.place;
  const out = match.players.find((game) => game.playerId === playerId)?.out;
  if (!out) return null;
  const ahead = match.players.filter((game) => game.out === null || game.out.frame > out.frame);
  return ahead.length + 1;
}
