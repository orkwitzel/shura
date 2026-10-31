import type { OnlineSession } from '@shura/client-core';
import { ActionType } from '@shura/engine';
import { QUICK_MATCH_ARRIVAL_MS } from '@shura/game';
import { expect, test } from 'vitest';
import { type OnlineWorld, onlineWorld } from '../support/online-world';

/** One loop wake per step: exactly 3 frames, a batch's worth. */
const STEP_MS = 50;

/** The nicknames seated in the session's room, sorted. */
const seated = (session: OnlineSession) =>
  session
    .getState()
    .room?.players.map(({ nickname }) => nickname)
    .sort();

/** Two clients who asked for a quick match, Ada first, everyone's messages arrived. */
async function paired(world: OnlineWorld) {
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  ada.quickMatch();
  await world.time.settle();
  bo.quickMatch();
  await world.time.settle();
  return { ada, bo };
}

/** Plays the current match to its end: `loser` hard-drops every step until they top out. */
async function playToEnd(world: OnlineWorld, loser: OnlineSession, winner: OnlineSession) {
  for (let step = 0; !loser.getState().match?.result && step < 2000; step++) {
    if (loser.getState().match?.phase === 'playing')
      loser.act(ActionType.HardDrop, world.time.now());
    if (winner.getState().match?.phase === 'playing' && step % 4 === 0) {
      winner.act(ActionType.HardDrop, world.time.now());
    }
    await world.time.advance(STEP_MS);
  }
  return loser.getState().match?.result;
}

test('two quick-matched players get a room with no host that starts by itself, and rematch', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  ada.quickMatch();
  await world.time.settle();
  expect(ada.getState().quickMatch).toBe('queued');
  expect(ada.getState().room).toBeNull();

  bo.quickMatch();
  await world.time.settle();
  const room = ada.getState().room;
  expect(room?.hostId).toBeUndefined();
  expect(seated(ada)).toEqual(['Ada', 'Bo']);
  expect(bo.getState().room?.code).toBe(room?.code);
  expect(ada.getState().quickMatch).toBe('idle');
  expect(await world.stores.matchQueue.length()).toBe(0);
  // Nobody readies up: the match counts down as soon as both are in.
  expect(ada.getState().match?.phase).toBe('countdown');
  expect(bo.getState().match?.phase).toBe('countdown');

  const first = await playToEnd(world, ada, bo);
  expect(first?.placements.map(({ playerId }) => playerId)).toEqual([
    bo.getState().sessionId,
    ada.getState().sessionId,
  ]);
  const firstMatch = ada.getState().match?.matchId;

  // One rematch isn't enough; both is.
  ada.rematch();
  await world.time.advance(STEP_MS);
  expect(bo.getState().match?.matchId).toBe(firstMatch);
  bo.rematch();
  await world.time.settle();
  expect(ada.getState().match?.phase).toBe('countdown');
  expect(ada.getState().match?.matchId).not.toBe(firstMatch);

  const second = await playToEnd(world, bo, ada);
  expect(second?.placements[0]?.playerId).toBe(ada.getState().sessionId);
  expect(ada.getState().room?.code).toBe(room?.code);
});

test('a player who leaves after results sends the other back to the queue screen', async () => {
  const world = await onlineWorld();
  const { ada, bo } = await paired(world);
  await playToEnd(world, ada, bo);
  ada.leaveRoom();
  await world.time.settle();
  expect(bo.getState().quickMatch).toBe('opponentLeft');
  expect(bo.getState().room).toBeNull();

  // Bo is free to queue again, straight away, and is paired with whoever comes next.
  bo.quickMatch();
  await world.time.settle();
  expect(bo.getState().quickMatch).toBe('queued');
  const cy = world.client('Cy');
  cy.quickMatch();
  await world.time.settle();
  expect(seated(bo)).toEqual(['Bo', 'Cy']);
});

test('a player who disconnects mid-match loses it, and the other gets opponentLeft after it', async () => {
  const world = await onlineWorld();
  const { ada, bo } = await paired(world);
  for (let step = 0; step < 70; step++) await world.time.advance(STEP_MS);
  ada.close();
  for (let step = 0; !bo.getState().match?.result && step < 40; step++) {
    await world.time.advance(STEP_MS);
  }
  expect(bo.getState().match?.result?.placements[0]?.playerId).toBe(bo.getState().sessionId);
  expect(bo.getState().quickMatch).toBe('opponentLeft');
  expect(bo.getState().room).toBeNull();
});

test('cancelling before a partner comes empties the queue, and asking twice queues once', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  ada.quickMatch();
  ada.quickMatch();
  await world.time.settle();
  expect(await world.stores.matchQueue.length()).toBe(1);
  expect(ada.getState().quickMatch).toBe('queued');

  ada.cancelQuickMatch();
  await world.time.settle();
  expect(await world.stores.matchQueue.length()).toBe(0);
  expect(ada.getState().quickMatch).toBe('idle');

  // Requeueing at once is refused for a short while (design §9.4).
  ada.quickMatch();
  await world.time.settle();
  expect(ada.getState().error?.code).toBe('rate_limited');
  expect(ada.getState().quickMatch).toBe('idle');
  expect(await world.stores.matchQueue.length()).toBe(0);
  await world.time.advance(3000);
  ada.quickMatch();
  await world.time.settle();
  expect(ada.getState().quickMatch).toBe('queued');
});

test('closing the connection while queued takes the session out of the queue', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  ada.quickMatch();
  await world.time.settle();
  ada.close();
  await world.time.settle();
  expect(await world.stores.matchQueue.length()).toBe(0);
});

test('a player paired with someone who never arrives is sent back to the queue screen', async () => {
  const world = await onlineWorld();
  // A waiting session whose gateway went away before it could hear it was paired.
  await world.stores.matchQueue.quickMatch('gone');
  const bo = world.client('Bo');
  bo.quickMatch();
  await world.time.settle();
  expect(seated(bo)).toEqual(['Bo']);
  await world.time.advance(QUICK_MATCH_ARRIVAL_MS);
  expect(bo.getState().quickMatch).toBe('opponentLeft');
  expect(bo.getState().room).toBeNull();
});

test('quick match is refused from inside a room', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  ada.createRoom('1v1');
  await world.time.settle();
  ada.quickMatch();
  await world.time.settle();
  expect(ada.getState().error?.code).toBe('wrong_phase');
  expect(await world.stores.matchQueue.length()).toBe(0);
});
