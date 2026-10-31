import type { OutReason } from '@shura/protocol';
import type { OnlineMatchState } from './online-match';

/** How a player went out, in words, as both UIs show it over their board (design §13.2). */
export const OUT_WORDS: Readonly<Record<OutReason, string>> = {
  toppedOut: 'topped out',
  laggedOut: 'lagged out',
  removed: 'removed',
  left: 'left',
};

/**
 * A player's place: the server's, once the match has ended, and before that the one their out frame
 * gives so far (design §10.1): one more than the players still in and those out at a later frame,
 * shared with anyone out at the same frame. `null` for a player still in.
 */
export function placeOf(
  match: Pick<OnlineMatchState, 'players' | 'result'>,
  playerId: string,
): number | null {
  const settled = match.result?.placements.find((placement) => placement.playerId === playerId);
  if (settled) return settled.place;
  const out = match.players.find((game) => game.playerId === playerId)?.out;
  if (!out) return null;
  const ahead = match.players.filter((game) => game.out === null || game.out.frame > out.frame);
  return ahead.length + 1;
}
