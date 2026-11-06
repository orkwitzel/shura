import type { RoomChange } from '@shura/client-core';

/** What the lobby's toast says of a change in the room (design §13.2, Lobby: "Mira is now host"). */
export function roomChangeText({ kind, nickname, you }: RoomChange): string {
  if (kind === 'joined') return `${nickname} joined`;
  if (kind === 'left') return `${nickname} left`;
  return you ? 'You are now host' : `${nickname} is now host`;
}
