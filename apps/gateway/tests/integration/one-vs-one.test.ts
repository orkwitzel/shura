import { ActionType } from '@shura/engine';
import { afterEach, expect, test } from 'vitest';
import { expectVerified, openRoom, ownGame, STEP_MS } from '../support/online-games';
import { type OnlineWorld, onlineWorld } from '../support/online-world';

let world: OnlineWorld;

afterEach(async () => {
  await world.close();
});

test('two clients play a 1v1 to matchEnd, and the server verified both games exactly', async () => {
  world = await onlineWorld();
  const { time } = world;
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const code = await openRoom(world, '1v1', ada, bo);
  expect(ada.getState().connection).toEqual({ status: 'connected' });
  expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}$/);
  expect(ada.getState().room?.hostId).toBe(ada.getState().sessionId);

  bo.setReady(true);
  await time.settle();
  expect(ada.getState().room?.players.map(({ nickname, ready }) => [nickname, ready])).toEqual([
    ['Ada', false],
    ['Bo', true],
  ]);

  ada.startMatch();
  await time.settle();
  expect(ada.getState().match?.phase).toBe('countdown');
  expect(bo.getState().room?.phase).toBe('countdown');

  // Ada hard-drops every step, so her stack tops out within a second; Bo drops every fourth.
  for (let step = 0; !ada.getState().match?.result && step < 2000; step++) {
    if (ada.getState().match?.phase === 'playing') ada.act(ActionType.HardDrop, time.now());
    if (bo.getState().match?.phase === 'playing' && step % 4 === 0) {
      bo.act(ActionType.HardDrop, time.now());
    }
    await time.advance(STEP_MS);
  }

  const adaId = ada.getState().sessionId;
  const boId = bo.getState().sessionId;
  const result = ada.getState().match?.result;
  expect(result?.placements).toEqual([
    { playerId: boId, place: 1 },
    { playerId: adaId, place: 2, reason: 'toppedOut', frame: ownGame(ada).engine.frame },
  ]);
  expect(bo.getState().match?.result).toEqual(result);
  expect(result?.stats.map(({ playerId }) => playerId).sort()).toEqual([adaId, boId].sort());
  expect(ownGame(ada).engine.toppedOut).toBe(true);
  // Straight back to the lobby, with each player's place (design §10.1).
  expect(ada.getState().room?.phase).toBe('lobby');
  expect(ada.getState().room?.players.map(({ lastPlace }) => lastPlace)).toEqual([2, 1]);

  // The server's verdict and each client's own game agree, frame for frame (design §14).
  expectVerified(world, code, [ada, bo]);
  // Each saw the other's game as the server verified it, through the relays (design §8.6).
  const adaAsBoSawIt = bo.getState().match?.players.find(({ playerId }) => playerId === adaId);
  expect(adaAsBoSawIt?.engine.frame).toBe(ownGame(ada).engine.frame);
  expect(adaAsBoSawIt?.out).toEqual({ reason: 'toppedOut', frame: ownGame(ada).engine.frame });
});
