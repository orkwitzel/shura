import { type OutReason, placeAmong, type ServerData } from '@shura/protocol';
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

/** How a player went out, in words, as both UIs show it over their board (design §13.2). */
export const OUT_WORDS: Readonly<Record<OutReason, string>> = {
  toppedOut: 'topped out',
  laggedOut: 'lagged out',
  removed: 'removed',
  left: 'left',
};

/** How long a match's results stay up in a room with a code before the lobby (design §13.2). */
export const RESULTS_MS = 10_000;

/** One player's row in a match's results: their place and stats, and whether it's yours. */
export interface ResultRow {
  readonly playerId: string;
  readonly place: number;
  readonly linesSent: number;
  readonly apm: number;
  readonly pps: number;
  readonly you: boolean;
}

/** A match's results as both UIs show them (design §13.2, Results). */
export interface MatchResultRows {
  /** Every player by place, those out at the same frame sharing one. */
  readonly rows: readonly ResultRow[];
  /** Your row, or `null` if you watched. */
  readonly mine: ResultRow | null;
  /** Who took first place: one player, or several sharing it. */
  readonly winners: readonly string[];
}

/** `result`'s rows for `you` (your session id, or `null` watching), a player with no stats at 0. */
export function matchResultRows(
  result: Pick<ServerData<'matchEnd'>, 'placements' | 'stats'>,
  you: string | null,
): MatchResultRows {
  const rows = [...result.placements]
    .sort((a, b) => a.place - b.place)
    .map(({ playerId, place }): ResultRow => {
      const stats = result.stats.find((each) => each.playerId === playerId);
      return {
        playerId,
        place,
        linesSent: stats?.linesSent ?? 0,
        apm: stats?.apm ?? 0,
        pps: stats?.pps ?? 0,
        you: playerId === you,
      };
    });
  return {
    rows,
    mine: rows.find((row) => row.you) ?? null,
    winners: rows.filter(({ place }) => place === 1).map(({ playerId }) => playerId),
  };
}
