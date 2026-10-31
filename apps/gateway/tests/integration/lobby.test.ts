import type { OnlineSession } from '@shura/client-core';
import { expect, test } from 'vitest';
import { type OnlineWorld, onlineWorld } from '../support/online-world';

/** A room `host` created, with `others` joined, everyone's messages arrived. */
async function room(world: OnlineWorld, host: OnlineSession, ...others: OnlineSession[]) {
  host.createRoom('1v1');
  await world.time.settle();
  const code = host.getState().room?.code ?? '';
  for (const other of others) other.joinRoom(code);
  await world.time.settle();
  return code;
}

const names = (session: OnlineSession) => {
  const room = session.getState().room;
  return {
    players: room?.players.map(({ nickname, seat }) => [nickname, seat]),
    spectators: room?.spectators.map(({ nickname }) => nickname),
  };
};

test('a 1v1 room seats two, and whoever joins after spectates (design §10.1)', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const cy = world.client('Cy');
  await room(world, ada, bo, cy);
  expect(names(cy)).toEqual({
    players: [
      ['Ada', 0],
      ['Bo', 1],
    ],
    spectators: ['Cy'],
  });
  expect(ada.getState().room?.hostId).toBe(ada.getState().sessionId);
});

test('a nickname already in the room gets #2', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const other = world.client('Ada');
  await room(world, ada, other);
  expect(names(ada).players).toEqual([
    ['Ada', 0],
    ['Ada#2', 1],
  ]);
});

test('only the host starts, and only once another seated player is ready', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  await room(world, ada, bo);
  bo.startMatch();
  ada.startMatch();
  await world.time.settle();
  expect(bo.getState().error?.code).toBe('not_host');
  expect(ada.getState().error?.code).toBe('wrong_phase');
  expect(ada.getState().room?.phase).toBe('lobby');

  bo.setReady(true);
  await world.time.settle();
  ada.startMatch();
  await world.time.settle();
  expect(ada.getState().room?.phase).toBe('countdown');
  expect(bo.getState().match?.players.map(({ index }) => index)).toEqual([0, 1]);
});

test('an unknown room code gets room_not_found', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  ada.joinRoom('ZZZZ');
  await world.time.settle();
  expect(ada.getState().error?.code).toBe('room_not_found');
  expect(ada.getState().room).toBeNull();
});

test('when the host leaves, the player there longest becomes host', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const cy = world.client('Cy');
  await room(world, ada, bo, cy);
  ada.leaveRoom();
  await world.time.settle();
  expect(cy.getState().room?.hostId).toBe(bo.getState().sessionId);
  expect(names(cy).players).toEqual([['Bo', 1]]);
});

test('a player who leaves mid-match is out, and the other wins', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  await room(world, ada, bo);
  bo.setReady(true);
  await world.time.settle();
  ada.startMatch();
  for (let step = 0; step < 70; step++) await world.time.advance(50);
  bo.leaveRoom();
  await world.time.settle();
  const result = ada.getState().match?.result;
  expect(result?.placements).toEqual([
    { playerId: ada.getState().sessionId, place: 1 },
    expect.objectContaining({ playerId: bo.getState().sessionId, place: 2, reason: 'left' }),
  ]);
});

test('closing the connection leaves the room', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  await room(world, ada, bo);
  bo.close();
  await world.time.settle();
  expect(names(ada).players).toEqual([['Ada', 0]]);
  expect(bo.getState().connection).toEqual({ status: 'closed' });
});
