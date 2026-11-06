import type { RoomMode } from '@shura/protocol';
import type { OnlineRoom } from '../online/online-session';

/** A room's mode as both UIs show it. */
export const MODE_NAMES: Readonly<Record<RoomMode, string>> = { '1v1': '1v1', ffa: 'FFA' };

/** A change in a room between two `roomState`s: a join, a leave, or a new host. */
export interface RoomChange {
  readonly kind: 'joined' | 'left' | 'host';
  readonly id: string;
  readonly nickname: string;
  /** Whether it's about you (only a host change can be). */
  readonly you: boolean;
}

/** Everyone in a room, seated or watching, by id. */
function members(room: OnlineRoom): Map<string, string> {
  return new Map(
    [...room.players, ...room.spectators].map(({ id, nickname }) => [id, nickname] as const),
  );
}

/**
 * What changed from `before` to `after` (design §13.2, Lobby: the room's events): who joined and
 * who left, seated or watching, then who is host now. A seat move is neither a join nor a leave.
 * Your own arrival, or a move to another room, is no change. `me` is your session id.
 */
export function roomChanges(
  before: OnlineRoom | null,
  after: OnlineRoom,
  me: string | null,
): RoomChange[] {
  if (!before || before.code !== after.code) return [];
  const was = members(before);
  const is = members(after);
  const changes: RoomChange[] = [];
  for (const [id, nickname] of is) {
    if (id !== me && !was.has(id)) changes.push({ kind: 'joined', id, nickname, you: false });
  }
  for (const [id, nickname] of was) {
    if (id !== me && !is.has(id)) changes.push({ kind: 'left', id, nickname, you: false });
  }
  const host = after.hostId;
  const hostName = host === undefined ? undefined : is.get(host);
  if (host !== undefined && host !== before.hostId && hostName !== undefined) {
    changes.push({ kind: 'host', id: host, nickname: hostName, you: host === me });
  }
  return changes;
}

/**
 * Who you are in a lobby, which decides what Enter (and R) does (design §10.1): the host, seated,
 * who can start once another seated player is ready (waiting for one to join, or to be ready); a
 * seated player, ready or not; or a spectator.
 */
export type LobbyRole =
  | { readonly kind: 'host'; readonly canStart: boolean; readonly waitingFor: 'join' | 'ready' }
  | { readonly kind: 'player'; readonly ready: boolean }
  | { readonly kind: 'spectator' };

/** Your role in `room`'s lobby; `me` is your session id. */
export function lobbyRole(room: OnlineRoom, me: string | null): LobbyRole {
  const seat = room.players.find(({ id }) => id === me);
  if (!seat) return { kind: 'spectator' };
  if (room.hostId !== me) return { kind: 'player', ready: seat.ready };
  const others = room.players.filter(({ id }) => id !== me);
  return {
    kind: 'host',
    canStart: others.some(({ ready }) => ready),
    waitingFor: others.length === 0 ? 'join' : 'ready',
  };
}
