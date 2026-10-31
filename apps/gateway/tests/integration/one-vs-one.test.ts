import type { OnlineSession } from '@shura/client-core';
import { ActionType, type EngineState, restoreEngine } from '@shura/engine';
import { expect, test } from 'vitest';
import { onlineWorld } from '../support/online-world';

/** One loop wake per step: exactly 3 frames, a batch's worth. */
const STEP_MS = 50;

/** Your own game in the session's current match. */
function ownGame(session: OnlineSession) {
  const { match } = session.getState();
  const game = match?.players.find(({ playerId }) => playerId === match.playerId);
  if (!game) throw new Error('not playing a match');
  return game;
}

/** The hash of the client's own engine, as the server hashes its copy. */
function ownHash(session: OnlineSession): string {
  return restoreEngine(structuredClone(ownGame(session).engine) as EngineState).hash();
}

test('two clients play a 1v1 to matchEnd, and the server verified both games exactly', async () => {
  const world = await onlineWorld();
  const { time } = world;
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  await time.settle();
  expect(ada.getState().connection).toEqual({ status: 'connected' });
  expect(ada.getState().nickname).toBe('Ada');

  ada.createRoom('1v1');
  await time.settle();
  const code = ada.getState().room?.code ?? '';
  expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}$/);

  bo.joinRoom(code);
  await time.settle();
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
  expect(ada.getState().room?.phase).toBe('lobby');

  // The server's verdict and each client's own game agree, frame for frame (design §14).
  const verified = world.game.verifiedGames(code);
  for (const session of [ada, bo]) {
    const server = verified.find(({ playerId }) => playerId === session.getState().sessionId);
    expect(server?.frame).toBe(ownGame(session).engine.frame);
    expect(server?.hash).toBe(ownHash(session));
  }
  // Each saw the other's game as the server verified it, through the relays (design §8.6).
  const adaAsBoSawIt = bo.getState().match?.players.find(({ playerId }) => playerId === adaId);
  expect(adaAsBoSawIt?.engine.frame).toBe(ownGame(ada).engine.frame);
  expect(adaAsBoSawIt?.out).toEqual({ reason: 'toppedOut', frame: ownGame(ada).engine.frame });
});
