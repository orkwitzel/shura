import { randomInt } from 'node:crypto';
import { ENGINE_VERSION } from '@shura/engine';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@shura/protocol';
import type { PodHealth, PodHeartbeat, Registry, RoomRecord } from '@shura/valkey';

/** How many random codes a new room tries before giving up. 920k codes make a clash rare. */
const CODE_TRIES = 10;

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

/**
 * Records `room` in the registry under a free random code, and returns the code, or `undefined` if
 * every try clashed.
 */
export async function claimRoomCode(
  registry: Registry,
  room: RoomRecord,
): Promise<string | undefined> {
  for (let tries = 0; tries < CODE_TRIES; tries++) {
    const code = randomRoomCode();
    if (await registry.create(code, room)) return code;
  }
  return undefined;
}
