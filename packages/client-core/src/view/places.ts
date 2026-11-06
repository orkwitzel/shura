import { placeAmong } from '@shura/protocol';
import type { OnlineMatchState, PlayerOut } from '../online/online-match';

/** What `placeOf` needs of a match: each player's out, and the result once it has ended. */
export interface PlacedMatch {
  readonly players: readonly { readonly playerId: string; readonly out: PlayerOut | null }[];
  readonly result: Pick<NonNullable<OnlineMatchState['result']>, 'placements'> | null;
}

/**
 * A player's place: the server's, once the match has ended, and before that the one their out
 * frame gives so far, by the server's rule (`placeAmong`, design §10.1): one more than the players
 * still in and those out at a later frame, shared with anyone out at the same frame. `null` for a
 * player still in, or not in the match.
 */
export function placeOf(match: PlacedMatch, playerId: string): number | null {
  const settled = match.result?.placements.find((placement) => placement.playerId === playerId);
  if (settled) return settled.place;
  const out = match.players.find((game) => game.playerId === playerId)?.out;
  if (!out) return null;
  return placeAmong(
    out.frame,
    match.players.map((game) => game.out?.frame ?? null),
  );
}

/** A place as words show it: 1st, 2nd, 3rd, 4th, 11th, 21st… */
export function ordinal(place: number): string {
  const tens = place % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] ?? 'th');
  return `${place}${suffix}`;
}
