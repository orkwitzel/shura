import type { RoomChange } from '@shura/client-core';

/**
 * `nickname` set apart from the words around it (Unicode's first-strong isolate), so a name in a
 * right-to-left script keeps its own direction and the English sentence keeps its order: "שירה
 * joined", not "joined שירה".
 */
export const isolate = (nickname: string): string => `\u2068${nickname}\u2069`;

/** What the lobby's notice says of a change in the room (design §13.2, Lobby: "Mira is now host"). */
export function roomChangeText({ kind, nickname, you }: RoomChange): string {
  if (kind === 'joined') return `${isolate(nickname)} joined`;
  if (kind === 'left') return `${isolate(nickname)} left`;
  return you ? 'You are now host' : `${isolate(nickname)} is now host`;
}
