import { BOT_PROFILES, type Bot, startBot } from '@shura/bot';
import type { OnlineSession } from '@shura/client-core';
import { ActionType, type EngineState, restoreEngine } from '@shura/engine';
import { expect, test } from 'vitest';
import { onlineWorld } from '../support/online-world';

/** One loop wake per step: exactly 3 frames, a batch's worth. */
const STEP_MS = 50;

function ownGame(session: OnlineSession) {
  const { match } = session.getState();
  const game = match?.players.find(({ playerId }) => playerId === match.playerId);
  if (!game) throw new Error('not playing a match');
  return game;
}

const ownHash = (session: OnlineSession): string =>
  restoreEngine(structuredClone(ownGame(session).engine) as EngineState).hash();

test('three bots and a scripted client play an FFA room to matchEnd, all verified', async () => {
  const world = await onlineWorld();
  const { time } = world;
  const host = world.client('Host');
  host.createRoom('ffa');
  await time.settle();
  const code = host.getState().room?.code ?? '';

  const sessions = ['Ada', 'Turing', 'Hopper'].map((name) => world.client(name));
  const bots: Bot[] = sessions.map((session, index) =>
    startBot({
      session,
      clock: time,
      profile: BOT_PROFILES.casual,
      seed: index + 1,
      target: { room: code },
    }),
  );
  // The bots join and ready up on their own.
  for (let step = 0; step < 100; step++) {
    const players = host.getState().room?.players ?? [];
    if (
      players.length === 4 &&
      players.every(({ ready, id }) => ready || id === host.getState().sessionId)
    )
      break;
    await time.advance(STEP_MS);
  }
  expect(host.getState().room?.players.map(({ nickname, ready }) => [nickname, ready])).toEqual([
    ['Host', false],
    ['Ada', true],
    ['Turing', true],
    ['Hopper', true],
  ]);

  host.startMatch();
  await time.settle();
  // The host hard-drops every few steps and tops out; the bots play on until gravity beats them.
  for (let step = 0; !host.getState().match?.result && step < 20 * 60 * 15; step++) {
    if (host.getState().match?.phase === 'playing' && step % 3 === 0) {
      host.act(ActionType.HardDrop, time.now());
    }
    await time.advance(STEP_MS);
  }

  const result = host.getState().match?.result;
  expect(result?.placements).toHaveLength(4);
  expect(result?.placements[0]?.playerId).not.toBe(host.getState().sessionId);
  for (const session of sessions) expect(session.getState().match?.result).toEqual(result);

  // Every bot placed its pieces through the input engine, and the server verified its game.
  const verified = world.game.verifiedGames(code);
  for (const session of [host, ...sessions]) {
    const server = verified.find(({ playerId }) => playerId === session.getState().sessionId);
    expect(server?.frame).toBe(ownGame(session).engine.frame);
    expect(server?.hash).toBe(ownHash(session));
  }
  for (const session of sessions) {
    expect(ownGame(session).engine.piecesPlaced).toBeGreaterThan(30);
    expect(ownGame(session).engine.linesCleared).toBeGreaterThan(5);
  }
  for (const bot of bots) bot.stop();
}, 120_000);
