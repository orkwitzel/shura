import type { OnlineSession } from '@shura/client-core';
import { afterEach, expect, test } from 'vitest';
import { VERSION_HEADERS } from '../support/api';
import { connected, openRoom, STEP_MS, startMatch } from '../support/online-games';
import { type OnlineWorld, onlineWorld } from '../support/online-world';

let world: OnlineWorld;

afterEach(async () => {
  await world.close();
});

const names = (session: OnlineSession) => {
  const room = session.getState().room;
  return {
    players: room?.players.map(({ nickname, seat }) => [nickname, seat]),
    spectators: room?.spectators.map(({ nickname }) => nickname),
  };
};

test('a 1v1 room seats two, and whoever joins after spectates (design §10.1)', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const cy = world.client('Cy');
  const code = await openRoom(world, '1v1', ada, bo, cy);
  expect(names(cy)).toEqual({
    players: [
      ['Ada', 0],
      ['Bo', 1],
    ],
    spectators: ['Cy'],
  });
  expect(ada.getState().room?.hostId).toBe(ada.getState().sessionId);

  // GET /api/rooms/:code answers from the registry, which the game pod keeps up to date.
  const res = await fetch(`${world.serverUrl}/api/rooms/${code.toLowerCase()}`, {
    headers: VERSION_HEADERS,
  });
  expect(await res.json()).toEqual({ code, mode: '1v1', seats: 2, seated: 2, spectators: 1 });
});

test('a nickname already in the room gets #2', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  const other = world.client('Ada');
  await openRoom(world, '1v1', ada, other);
  expect(names(ada).players).toEqual([
    ['Ada', 0],
    ['Ada#2', 1],
  ]);
  expect(other.getState().nickname).toBe('Ada#2');
});

test('only the host starts, and only once another seated player is ready', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  await openRoom(world, '1v1', ada, bo);
  bo.startMatch();
  ada.startMatch();
  await world.time.settle();
  expect(bo.getState().error?.code).toBe('not_host');
  expect(ada.getState().error?.code).toBe('wrong_phase');
  expect(ada.getState().room?.phase).toBe('lobby');

  await startMatch(world, ada, bo);
  expect(ada.getState().room?.phase).toBe('countdown');
  expect(bo.getState().match?.players.map(({ index }) => index)).toEqual([0, 1]);
});

test('an unknown room code gets room_not_found', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  await connected(world, ada);
  ada.joinRoom('ZZZZ');
  await world.time.settle();
  expect(ada.getState().error?.code).toBe('room_not_found');
  expect(ada.getState().room).toBeNull();
});

test('a session in a room is refused another one with wrong_phase', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  await openRoom(world, '1v1', ada);
  ada.createRoom('ffa');
  await world.time.settle();
  expect(ada.getState().error?.code).toBe('wrong_phase');
});

test('when the host leaves, the player there longest becomes host', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const cy = world.client('Cy');
  await openRoom(world, '1v1', ada, bo, cy);
  ada.leaveRoom();
  await world.time.settle();
  expect(cy.getState().room?.hostId).toBe(bo.getState().sessionId);
  expect(names(cy).players).toEqual([['Bo', 1]]);
});

test('a player who leaves mid-match is out, and the other wins', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  await openRoom(world, '1v1', ada, bo);
  await startMatch(world, ada, bo);
  for (let step = 0; step < 70; step++) await world.time.advance(STEP_MS);
  bo.leaveRoom();
  await world.time.settle();
  await world.time.advance(STEP_MS);
  const result = ada.getState().match?.result;
  expect(result?.placements).toEqual([
    { playerId: ada.getState().sessionId, place: 1 },
    expect.objectContaining({ playerId: bo.getState().sessionId, place: 2, reason: 'left' }),
  ]);
});

test('closing the connection leaves the room', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  await openRoom(world, '1v1', ada, bo);
  bo.close();
  await world.time.settle();
  expect(names(ada).players).toEqual([['Ada', 0]]);
  expect(bo.getState().connection).toEqual({ status: 'closed' });
});
