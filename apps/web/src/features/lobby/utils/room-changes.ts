import type { OnlineRoom } from '@shura/client-core';

/** Everyone in a room, seated or watching, by id. */
function members(room: OnlineRoom): Map<string, string> {
  return new Map(
    [...room.players, ...room.spectators].map(({ id, nickname }) => [id, nickname] as const),
  );
}

/**
 * What the lobby's toasts say about the change from `before` to `after` (design §13.2, Lobby): who
 * joined and who left, seated or watching, and who is host now ("Mira is now host"). A seat move
 * is neither a join nor a leave. Your own arrival, or a move to another room, says nothing.
 */
export function roomChanges(
  before: OnlineRoom | null,
  after: OnlineRoom,
  me: string | null,
): string[] {
  if (!before || before.code !== after.code) return [];
  const was = members(before);
  const is = members(after);
  const said: string[] = [];
  for (const [id, nickname] of is) if (id !== me && !was.has(id)) said.push(`${nickname} joined`);
  for (const [id, nickname] of was) if (id !== me && !is.has(id)) said.push(`${nickname} left`);
  if (after.hostId !== undefined && after.hostId !== before.hostId) {
    said.push(
      after.hostId === me ? 'You are now host' : `${is.get(after.hostId) ?? 'Someone'} is now host`,
    );
  }
  return said;
}
