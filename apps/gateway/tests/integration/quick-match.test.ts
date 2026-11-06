import type { OnlineSession } from '@shura/client-core';
import { ActionType } from '@shura/engine';
import { QUICK_MATCH_ARRIVAL_MS } from '@shura/game/rooms';
import { LIMIT_DEFAULTS } from '@shura/protocol';
import { afterEach, expect, test } from 'vitest';
import { connected, eventually, expectVerified, STEP_MS } from '../support/online-games';
import { type OnlineWorld, onlineWorld } from '../support/online-world';

let world: OnlineWorld;

afterEach(async () => {
  await world.close();
});

/** The nicknames seated in the session's room, sorted. */
const seated = (session: OnlineSession) =>
  session
    .getState()
    .room?.players.map(({ nickname }) => nickname)
    .sort();

/** Two clients who asked for a quick match, Ada first, and were paired into one room. */
async function paired() {
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  await connected(world, ada, bo);
  ada.quickMatch();
  await eventually(world, () => ada.getState().quickMatch === 'queued', 'Ada queued');
  bo.quickMatch();
  await eventually(
    world,
    () => seated(ada)?.length === 2 && seated(bo)?.length === 2,
    'both are in the room',
  );
  return { ada, bo };
}

/** Plays the current match to its end: `loser` hard-drops every step until they top out. */
async function playToEnd(loser: OnlineSession, winner: OnlineSession) {
  const { time } = world;
  for (let step = 0; !loser.getState().match?.result && step < 2000; step++) {
    if (loser.getState().match?.phase === 'playing') loser.act(ActionType.HardDrop, time.now());
    if (winner.getState().match?.phase === 'playing' && step % 4 === 0) {
      winner.act(ActionType.HardDrop, time.now());
    }
    await time.advance(STEP_MS);
  }
  await eventually(world, () => winner.getState().match?.result !== undefined, 'both saw the end');
  return loser.getState().match?.result;
}

test('two quick-matched players get a room with no host that starts by itself, and rematch', async () => {
  world = await onlineWorld();
  const { ada, bo } = await paired();
  const room = ada.getState().room;
  expect(room?.quickMatch).toBe(true);
  expect(room?.hostId).toBeUndefined();
  expect(bo.getState().room?.code).toBe(room?.code);
  expect(ada.getState().quickMatch).toBe('idle');
  expect(await world.stores.matchQueue.length()).toBe(0);
  expect(await world.stores.registry.get(room?.code ?? '')).toMatchObject({ quickMatch: true });
  // Nobody readies up: the match counts down as soon as both are in.
  await eventually(
    world,
    () => ada.getState().match?.phase === 'countdown' && bo.getState().match !== null,
    'the match counts down',
  );

  const first = await playToEnd(ada, bo);
  expect(first?.placements.map(({ playerId }) => playerId)).toEqual([
    bo.getState().sessionId,
    ada.getState().sessionId,
  ]);
  expectVerified(world, room?.code ?? '', [ada, bo]);
  const firstMatch = ada.getState().match?.matchId;

  // One rematch isn't enough; both is.
  ada.rematch();
  await world.time.settle();
  expect(bo.getState().match?.matchId).toBe(firstMatch);
  expect(ada.getState().room?.phase).toBe('lobby');
  bo.rematch();
  await eventually(
    world,
    () =>
      ada.getState().match?.matchId !== firstMatch && bo.getState().match?.matchId !== firstMatch,
    'the rematch counts down',
  );
  expect(ada.getState().match?.phase).toBe('countdown');

  const second = await playToEnd(bo, ada);
  expect(second?.placements[0]?.playerId).toBe(ada.getState().sessionId);
  expect(ada.getState().room?.code).toBe(room?.code);
  expectVerified(world, room?.code ?? '', [ada, bo]);
});

test('a player who leaves after results sends the other back to the waiting screen', async () => {
  world = await onlineWorld();
  const { ada, bo } = await paired();
  await playToEnd(ada, bo);
  expectVerified(world, ada.getState().room?.code ?? '', [ada, bo]);
  ada.leaveRoom();
  await eventually(world, () => bo.getState().quickMatch === 'opponentLeft', 'Bo heard');
  expect(bo.getState().room).toBeNull();

  // Bo is free to queue again, straight away, and is paired with whoever comes next.
  bo.quickMatch();
  await eventually(world, () => bo.getState().quickMatch === 'queued', 'Bo queued again');
  const cy = world.client('Cy');
  await connected(world, cy);
  cy.quickMatch();
  await eventually(world, () => seated(bo)?.length === 2, 'Bo and Cy are paired');
  expect(seated(bo)).toEqual(['Bo', 'Cy']);
});

test('cancelling before a partner comes empties the queue, and asking twice queues once', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  await connected(world, ada);
  ada.quickMatch();
  ada.quickMatch();
  await world.time.settle();
  expect(await world.stores.matchQueue.length()).toBe(1);
  expect(ada.getState().quickMatch).toBe('queued');

  ada.cancelQuickMatch();
  await eventually(world, () => ada.getState().quickMatch === 'idle', 'Ada cancelled');
  expect(await world.stores.matchQueue.length()).toBe(0);

  // Requeueing at once is refused for a short while (design §9.4).
  ada.quickMatch();
  await eventually(world, () => ada.getState().error !== null, 'Ada was refused');
  expect(ada.getState().error?.code).toBe('rate_limited');
  expect(ada.getState().quickMatch).toBe('idle');
  expect(await world.stores.matchQueue.length()).toBe(0);
  await world.time.advance(LIMIT_DEFAULTS.quickMatchCooldownMs);
  ada.quickMatch();
  await eventually(world, () => ada.getState().quickMatch === 'queued', 'Ada queued again');
});

test('a player who disconnects mid-match loses it, and the other gets opponentLeft after it', async () => {
  world = await onlineWorld();
  const { ada, bo } = await paired();
  for (let step = 0; step < 70; step++) await world.time.advance(STEP_MS);
  expect(bo.getState().match?.phase).toBe('playing');
  ada.close();
  await eventually(world, () => bo.getState().quickMatch === 'opponentLeft', 'Bo heard');
  expect(bo.getState().match?.result?.placements[0]?.playerId).toBe(bo.getState().sessionId);
  expect(bo.getState().room).toBeNull();
});

test('closing the connection while queued takes the session out of the queue', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  await connected(world, ada);
  ada.quickMatch();
  await eventually(world, () => ada.getState().quickMatch === 'queued', 'Ada queued');
  ada.close();
  await world.time.settle();
  expect(await world.stores.matchQueue.length()).toBe(0);
});

test('a player paired with someone who never arrives is sent back to the waiting screen', async () => {
  world = await onlineWorld();
  // A waiting session whose gateway went away before it could hear it was paired.
  await world.stores.matchQueue.quickMatch('gone');
  const bo = world.client('Bo');
  await connected(world, bo);
  bo.quickMatch();
  await eventually(world, () => seated(bo)?.length === 1, 'Bo is in the room');
  await world.time.advance(QUICK_MATCH_ARRIVAL_MS);
  await eventually(world, () => bo.getState().quickMatch === 'opponentLeft', 'Bo was sent back');
  expect(bo.getState().room).toBeNull();
});

test('quick match is refused from inside a room, and a quick-match room has no ready', async () => {
  world = await onlineWorld();
  const cy = world.client('Cy');
  await connected(world, cy);
  cy.createRoom('1v1');
  await eventually(world, () => cy.getState().room !== null, 'Cy is in a room');
  cy.quickMatch();
  await eventually(world, () => cy.getState().error !== null, 'Cy was refused');
  expect(cy.getState().error?.code).toBe('wrong_phase');
  expect(await world.stores.matchQueue.length()).toBe(0);

  const { ada } = await paired();
  ada.setReady(true);
  await eventually(world, () => ada.getState().error !== null, 'Ada was refused');
  expect(ada.getState().error).toEqual({
    code: 'wrong_phase',
    message: 'Quick-match rooms start by themselves.',
  });
});
