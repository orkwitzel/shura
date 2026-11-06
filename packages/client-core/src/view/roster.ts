import type { PlayerKind } from '@shura/protocol';
import type { OnlineMatchState, RosterEntry } from '../online/online-match';
import type { OnlineRoom } from '../online/online-session';

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

/**
 * A player's kind (`guest` or `bot`, design §10.2), from the room's seats and spectators, for the
 * tags both UIs show. `null` for someone no longer in the room, or with no room.
 */
export function kindOf(
  room: Pick<OnlineRoom, 'players' | 'spectators'> | null,
  playerId: string,
): PlayerKind | null {
  const member = [...(room?.players ?? []), ...(room?.spectators ?? [])].find(
    ({ id }) => id === playerId,
  );
  return member?.kind ?? null;
}
