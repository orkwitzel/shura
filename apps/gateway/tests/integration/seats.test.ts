import type { OnlineSession } from '@shura/client-core';
import { MAX_SPECTATORS, SEAT_HOLD_MS } from '@shura/protocol';
import { afterEach, expect, test } from 'vitest';
import { faultySocket } from '../support/faulty-socket';
import { connected, eventually, openRoom, STEP_MS, startMatch } from '../support/online-games';
import { type OnlineWorld, onlineWorld } from '../support/online-world';

let world: OnlineWorld;

afterEach(async () => {
  await world.close();
});

const seats = (session: OnlineSession) => {
  const room = session.getState().room;
  return {
    players: room?.players.map(({ nickname, seat }) => [nickname, seat]),
    spectators: room?.spectators.map(({ nickname }) => nickname),
  };
};

test('a full 1v1 room makes spectators, who take freed seats at the next lobby in arrival order', async () => {
  world = await onlineWorld();
  const [ada, bo, cy, di] = ['Ada', 'Bo', 'Cy', 'Di'].map((name) => world.client(name));
  if (!ada || !bo || !cy || !di) throw new Error('four clients');
  await openRoom(world, '1v1', ada, bo, cy, di);
  expect(seats(ada).spectators).toEqual(['Cy', 'Di']);

  await startMatch(world, ada, bo);
  for (let step = 0; step < 70; step++) await world.time.advance(STEP_MS);
  // Nobody takes a seat during a match.
  cy.takeSeat();
  await world.time.settle();
  expect(cy.getState().error?.code).toBe('wrong_phase');

  bo.leaveRoom();
  await world.time.settle();
  expect(ada.getState().room?.phase).toBe('lobby');
  expect(seats(di)).toEqual({
    players: [
      ['Ada', 0],
      ['Cy', 1],
    ],
    spectators: ['Di'],
  });
});

test(`the spectator after the ${MAX_SPECTATORS}th gets room_full`, async () => {
  world = await onlineWorld();
  const host = world.client('Host');
  const guest = world.client('Guest');
  const watchers = Array.from({ length: MAX_SPECTATORS }, (_, n) => world.client(`W${n}`));
  await openRoom(world, '1v1', host, guest, ...watchers);
  expect(host.getState().room?.spectators).toHaveLength(MAX_SPECTATORS);
  const late = world.client('Late');
  await connected(world, late);
  late.joinRoom(host.getState().room?.code ?? '');
  await eventually(world, () => late.getState().error !== null, 'Late was answered');
  expect(late.getState().error?.code).toBe('room_full');
  expect(late.getState().room).toBeNull();
});

test('a seated player who isn’t ready sits the match out and watches it', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const cy = world.client('Cy');
  // An FFA room starts with 2 players.
  await openRoom(world, 'ffa', ada, bo, cy);
  await startMatch(world, ada, bo);
  const ids = [ada, bo].map((session) => session.getState().sessionId);
  expect(cy.getState().match?.players.map(({ playerId }) => playerId)).toEqual(ids);
  expect(cy.getState().match?.playerId).toBeNull();
  expect(seats(cy).players).toEqual([
    ['Ada', 0],
    ['Bo', 1],
    ['Cy', 2],
  ]);
});

test('in the lobby, spectate steps out of a seat and takeSeat takes a free one', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const cy = world.client('Cy');
  await openRoom(world, '1v1', ada, bo, cy);
  cy.takeSeat();
  await world.time.settle();
  expect(cy.getState().error?.code).toBe('no_free_seat');

  bo.spectate();
  await world.time.settle();
  // Spectators are listed in the order they came to the room.
  expect(seats(ada)).toEqual({ players: [['Ada', 0]], spectators: ['Bo', 'Cy'] });
  cy.takeSeat();
  await world.time.settle();
  expect(seats(ada)).toEqual({
    players: [
      ['Ada', 0],
      ['Cy', 1],
    ],
    spectators: ['Bo'],
  });
});

test('a nickname changes in the lobby only, normalised, with #2 for a duplicate', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  await openRoom(world, '1v1', ada, bo);
  bo.setNickname('  Ada ');
  await world.time.settle();
  expect(seats(ada).players).toEqual([
    ['Ada', 0],
    ['Ada#2', 1],
  ]);
  expect(bo.getState().nickname).toBe('Ada#2');
  expect(ada.getState().names.get(bo.getState().sessionId ?? '')).toBe('Ada#2');

  bo.setNickname('​');
  await world.time.settle();
  expect(bo.getState().error?.code).toBe('nickname_invalid');

  await startMatch(world, ada, bo);
  bo.setNickname('Bo');
  await world.time.settle();
  expect(bo.getState().error?.code).toBe('wrong_phase');
  expect(seats(ada).players?.[1]).toEqual(['Ada#2', 1]);
});

test('roomState says each player’s kind, guest or bot', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  const bot = world.client('Bot', { kind: 'bot' });
  await openRoom(world, '1v1', ada, bot);
  expect(ada.getState().room?.players.map(({ kind }) => kind)).toEqual(['guest', 'bot']);
});

test('a lobby seat is held for 30 s after a disconnect, then freed', async () => {
  world = await onlineWorld();
  const line = faultySocket();
  const ada = world.client('Ada');
  const bo = world.client('Bo', line);
  await openRoom(world, '1v1', ada, bo);
  line.drop();
  await world.time.settle();
  expect(bo.getState().connection).toEqual({ status: 'reconnecting' });
  await world.time.advance(SEAT_HOLD_MS - 100);
  expect(seats(ada).players).toEqual([
    ['Ada', 0],
    ['Bo', 1],
  ]);
  await world.time.advance(100);
  expect(seats(ada).players).toEqual([['Ada', 0]]);
});

test('back within the hold, a player has the same seat, nickname, ready and session', async () => {
  world = await onlineWorld();
  const line = faultySocket();
  const ada = world.client('Ada');
  const bo = world.client('Ada', line);
  const code = await openRoom(world, '1v1', ada, bo);
  const id = bo.getState().sessionId;
  bo.setReady(true);
  await world.time.settle();
  line.drop();
  await world.time.advance(10_000);
  line.restore();
  await world.time.advance(2000);
  await eventually(
    world,
    () => bo.getState().connection.status === 'connected',
    'Bo is connected again',
  );
  expect(bo.getState().sessionId).toBe(id);
  expect(bo.getState().room?.code).toBe(code);
  expect(
    bo.getState().room?.players.map(({ nickname, seat, ready }) => [nickname, seat, ready]),
  ).toEqual([
    ['Ada', 0, false],
    ['Ada#2', 1, true],
  ]);
  // The seat is no longer held: it stays hers past the 30 s.
  await world.time.advance(SEAT_HOLD_MS);
  expect(seats(ada).players).toHaveLength(2);
});

test('the host’s role goes to the member there longest who is still connected', async () => {
  world = await onlineWorld();
  const line = faultySocket();
  const ada = world.client('Ada');
  const bo = world.client('Bo', line);
  const cy = world.client('Cy');
  await openRoom(world, '1v1', ada, bo, cy);
  line.drop();
  await world.time.settle();
  ada.leaveRoom();
  await world.time.settle();
  expect(cy.getState().room?.hostId).toBe(cy.getState().sessionId);
});

test('a session whose room is gone is told so when it comes back', async () => {
  world = await onlineWorld();
  const line = faultySocket();
  const ada = world.client('Ada', line);
  const code = await openRoom(world, '1v1', ada);
  line.drop();
  await world.time.settle();
  // The room's record goes, as it does once the room has been deleted.
  await world.stores.registry.delete(code);
  line.restore();
  await world.time.advance(1000);
  expect(ada.getState().connection).toEqual({ status: 'connected' });
  expect(ada.getState().error?.code).toBe('room_not_found');
  expect(ada.getState().room).toBeNull();
});
