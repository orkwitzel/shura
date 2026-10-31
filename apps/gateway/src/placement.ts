import { randomInt } from 'node:crypto';
import { ENGINE_VERSION } from '@shura/engine';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@shura/protocol';
import type { PodHealth, PodHeartbeat } from '@shura/valkey';

/**
 * The game pod a new room goes to (design §9.2): the least-loaded live pod running this
 * gateway's `engineVersion` that isn't draining, or `undefined` if there is none.
 */
export async function placeRoom(podHealth: PodHealth): Promise<PodHeartbeat | undefined> {
  const pods = await podHealth.list();
  return pods
    .filter((pod) => pod.engineVersion === ENGINE_VERSION && !pod.draining)
    .sort((a, b) => a.roomCount - b.roomCount)[0];
}

/** A random room code (design §10.3). The registry says whether it's free. */
export function randomRoomCode(): string {
  return Array.from(
    { length: ROOM_CODE_LENGTH },
    () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
  ).join('');
}
