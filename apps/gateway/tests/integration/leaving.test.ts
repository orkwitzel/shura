import type { OnlineSession } from '@shura/client-core';
import { ActionType } from '@shura/engine';
import { expect, test } from 'vitest';
import { onlineWorld } from '../support/online-world';

/** One loop wake per step: exactly 3 frames, a batch's worth. */
const STEP_MS = 50;

/** `whose` game as `session` sees it in the current match. */
function gameOf(session: OnlineSession, whose: OnlineSession) {
  const { match } = session.getState();
  const game = match?.players.find(({ playerId }) => playerId === whose.getState().sessionId);
  if (!game) throw new Error('no such game');
  return game;
}

test('a player who leaves the match is out with left, and watches the rest from the room', async () => {
  const world = await onlineWorld();
  const { time } = world;
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const cy = world.client('Cy');
  await time.settle();
  ada.createRoom('ffa');
  await time.settle();
  const code = ada.getState().room?.code ?? '';
  for (const other of [bo, cy]) other.joinRoom(code);
  await time.settle();
  for (const other of [bo, cy]) other.setReady(true);
  await time.settle();
  ada.startMatch();
  await time.settle();

  // Into the match, a second of play.
  for (let step = 0; step < 80; step++) await time.advance(STEP_MS);
  expect(bo.getState().match?.phase).toBe('playing');
  bo.leaveMatch();
  await time.settle();
  const left = gameOf(bo, bo).engine.frame;
  expect(left).toBeGreaterThan(0);
  for (const session of [ada, bo, cy]) {
    expect(gameOf(session, bo).out).toEqual({ reason: 'left', frame: left });
  }

  // Ada hard-drops every step until she tops out; Cy plays on and wins.
  for (let step = 0; !cy.getState().match?.result && step < 2000; step++) {
    ada.act(ActionType.HardDrop, time.now());
    await time.advance(STEP_MS);
  }
  // Bo's own game stopped where he left, and he kept watching the others through the relays.
  expect(gameOf(bo, bo).engine.frame).toBe(left);
  expect(gameOf(bo, ada).engine.frame).toBe(gameOf(ada, ada).engine.frame);
  expect(bo.getState().room?.players.map(({ nickname }) => nickname)).toEqual(['Ada', 'Bo', 'Cy']);
  const result = bo.getState().match?.result;
  expect(result).toEqual(cy.getState().match?.result);
  expect(result?.placements).toEqual([
    { playerId: cy.getState().sessionId, place: 1 },
    {
      playerId: ada.getState().sessionId,
      place: 2,
      reason: 'toppedOut',
      frame: gameOf(ada, ada).engine.frame,
    },
    { playerId: bo.getState().sessionId, place: 3, reason: 'left', frame: left },
  ]);
});

test('leaving a match you are not playing is refused', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  await world.time.settle();
  ada.createRoom('1v1');
  await world.time.settle();
  ada.leaveMatch();
  await world.time.settle();
  expect(ada.getState().error?.code).toBe('wrong_phase');
});
