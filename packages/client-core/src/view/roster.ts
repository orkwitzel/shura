import type { OnlineMatchState, RosterEntry } from '../online/online-match';

/** What both UIs call a player whose nickname they never saw (design §13.2). */
export const UNKNOWN_NICKNAME = 'player';

/** A player's nickname, from every one seen in the room (`names`), or `UNKNOWN_NICKNAME`. */
export function nicknameOf(names: ReadonlyMap<string, string>, playerId: string): string {
  return names.get(playerId) ?? UNKNOWN_NICKNAME;
}

/** A player's entry in the match's roster: how they went out and their place. */
export function rosterEntryOf(
  match: Pick<OnlineMatchState, 'roster'>,
  playerId: string,
): RosterEntry | undefined {
  return match.roster.find((entry) => entry.playerId === playerId);
}
