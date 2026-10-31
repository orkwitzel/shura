import type { OnlineSession } from '@shura/client-core';
import { MAX_SPECTATORS, SEAT_HOLD_MS } from '@shura/protocol';
import { expect, test } from 'vitest';
import { openRoom, STEP_MS, startMatch } from '../support/online-games';
import { onlineWorld } from '../support/online-world';

const seats = (session: OnlineSession) => {
  const room = session.getState().room;
  return {
    players: room?.players.map(({ nickname, seat }) => [nickname, seat]),
    spectators: room?.spectators.map(({ nickname }) => nickname),
  };
};

test('a full 1v1 room makes spectators, who take freed seats at the next lobby in arrival order', async () => {
  const world = await onlineWorld();
  const [ada, bo, cy, di] = ['Ada', 'Bo', 'Cy', 'Di'].map((name) => world.client(name));
  if (!ada || !bo || !cy || !di) throw new Error('clients');
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
  expect(seats(ada)).toEqual({
    players: [
      ['Ada', 0],
      ['Cy', 1],
    ],
    spectators: ['Di'],
  });
});

test(`the spectator after the ${MAX_SPECTATORS}th gets room_full`, async () => {
  // Every client is on this machine, which a laptop's limits exempt (design §11).
  const world = await onlineWorld({ limits: { exemptIps: ['127.0.0.1'] } });
  const host = world.client('Host');
  const guest = world.client('Guest');
  const watchers = Array.from({ length: MAX_SPECTATORS + 1 }, (_, n) => world.client(`W${n}`));
  await openRoom(world, '1v1', host, guest, ...watchers);
  expect(host.getState().room?.spectators).toHaveLength(MAX_SPECTATORS);
  expect(watchers.at(-2)?.getState().room).not.toBeNull();
  expect(watchers.at(-1)?.getState().error?.code).toBe('room_full');
  expect(watchers.at(-1)?.getState().room).toBeNull();
});

test('a seated player who isn’t ready sits the match out and watches it', async () => {
  const world = await onlineWorld();
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
  const world = await onlineWorld();
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

test('a nickname changes in the lobby only, with #2 for a duplicate', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  await openRoom(world, '1v1', ada, bo);
  bo.setNickname('  Ada ');
  await world.time.settle();
  expect(seats(ada).players).toEqual([
    ['Ada', 0],
    ['Ada#2', 1],
  ]);
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
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bot = world.client('Bot', { kind: 'bot' });
  await openRoom(world, '1v1', ada, bot);
  expect(ada.getState().room?.players.map(({ kind }) => kind)).toEqual(['guest', 'bot']);
});

test('a lobby seat is held for 30 s after a disconnect, then freed', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  await openRoom(world, '1v1', ada, bo);
  world.line(bo).cut();
  await world.time.settle();
  await world.time.advance(SEAT_HOLD_MS - 100);
  expect(seats(ada).players).toEqual([
    ['Ada', 0],
    ['Bo', 1],
  ]);
  await world.time.advance(100);
  expect(seats(ada).players).toEqual([['Ada', 0]]);
});

test('back within the hold, a player has the same seat, nickname and session', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Ada');
  const code = await openRoom(world, '1v1', ada, bo);
  const id = bo.getState().sessionId;
  bo.setReady(true);
  await world.time.settle();
  world.line(bo).cut();
  await world.time.advance(10_000);
  world.line(bo).restore();
  await world.time.advance(2000);
  expect(bo.getState().connection).toEqual({ status: 'connected' });
  expect(bo.getState().sessionId).toBe(id);
  expect(bo.getState().room?.code).toBe(code);
  expect(
    bo.getState().room?.players.map(({ nickname, seat, ready }) => [nickname, seat, ready]),
  ).toEqual([
    ['Ada', 0, false],
    ['Ada#2', 1, true],
  ]);
});

test('the host’s role goes to the member there longest who is still connected', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const cy = world.client('Cy');
  await openRoom(world, '1v1', ada, bo, cy);
  world.line(bo).cut();
  await world.time.settle();
  ada.leaveRoom();
  await world.time.settle();
  expect(cy.getState().room?.hostId).toBe(cy.getState().sessionId);
});
