import { EMPTY_ROOM_MS } from '@shura/protocol';
import { createMemoryStores } from '@shura/valkey';
import { expect, test } from 'vitest';
import type { WebSocket } from 'ws';
import { CLOCK } from '../../src/clock';
import { QUICK_MATCH_ARRIVAL_MS, RoomsService } from '../../src/rooms';
import { STORES } from '../../src/valkey';
import { boot, connect } from '../support/boot';
import { fakeClock } from '../support/fake-clock';

const START = 1_800_000_000_000;
const CODE = 'K7QX';

/** Sends a link message for room `CODE` and epoch 0. */
const send = (link: WebSocket, event: string, data: Record<string, unknown>) =>
  link.send(JSON.stringify({ event, data: { roomCode: CODE, epoch: 0, ...data } }));

/** The next routed message `link` receives for `sessionId`, as `{ event, data }`. */
const nextFor = (link: WebSocket, sessionId: string) =>
  new Promise<{ event: string; data: Record<string, unknown> }>((resolve) => {
    const listener = (raw: unknown) => {
      const message = JSON.parse(String(raw));
      if (message.data?.sessionId !== sessionId) return;
      link.off('message', listener);
      resolve(message);
    };
    link.on('message', listener);
  });

/**
 * A game service on a fake clock, with a gateway's link that has created quick-match room `CODE`
 * (and the registry record the gateway claimed for it).
 */
async function podWithQuickRoom() {
  const clock = fakeClock(START);
  const stores = createMemoryStores();
  const booted = await boot({
    override: (builder) =>
      builder.overrideProvider(CLOCK).useValue(clock).overrideProvider(STORES).useValue(stores),
  });
  const rooms = booted.app.get(RoomsService);
  await stores.registry.create(CODE, {
    podAddress: 'pod-1:3001',
    epoch: 0,
    mode: '1v1',
    phase: 'lobby',
    quickMatch: true,
    seated: 0,
    spectators: 0,
  });
  const link = await connect(`${booted.ws}/room-links`);
  send(link, 'createRoom', { mode: '1v1', quickMatch: true });
  await expect.poll(() => rooms.roomCount).toBe(1);
  const close = async () => {
    link.close();
    await booted.app.close();
  };
  return { clock, stores, rooms, link, close };
}

test('a room nobody attaches to is deleted once it has been empty for EMPTY_ROOM_MS', async () => {
  const { clock, stores, rooms, close } = await podWithQuickRoom();

  clock.advanceTo(START + EMPTY_ROOM_MS - 1);
  expect(rooms.roomCount).toBe(1);
  clock.advanceTo(START + EMPTY_ROOM_MS);
  expect(rooms.roomCount).toBe(0);
  await expect.poll(() => stores.registry.get(CODE)).toBeUndefined();

  await close();
});

test('a quick-match room that broke up is still deleted after a late arrival is sent away', async () => {
  const { clock, stores, rooms, link, close } = await podWithQuickRoom();
  const joined = nextFor(link, 'a');
  send(link, 'attach', { sessionId: 'a', nickname: 'Ada', kind: 'guest' });
  await joined;

  // Bo never arrives: the room breaks up, and Ada is sent away.
  const brokenUp = nextFor(link, 'a');
  clock.advanceTo(START + QUICK_MATCH_ARRIVAL_MS);
  expect((await brokenUp).event).toBe('opponentLeft');

  // Bo arrives late and is sent away too, which leaves the room empty.
  const late = nextFor(link, 'b');
  send(link, 'attach', { sessionId: 'b', nickname: 'Bo', kind: 'guest' });
  expect((await late).event).toBe('opponentLeft');

  clock.advanceTo(clock.now() + EMPTY_ROOM_MS);
  expect(rooms.roomCount).toBe(0);
  await expect.poll(() => stores.registry.get(CODE)).toBeUndefined();

  await close();
});
