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

test('a quick-match bot pairs with a scripted client, plays to matchEnd, rematches and requeues', async () => {
  const world = await onlineWorld();
  const { time } = world;
  const session = world.client('Ada');
  const bot = startBot({
    session,
    clock: time,
    profile: BOT_PROFILES.casual,
    seed: 7,
    target: { quickMatch: true },
  });
  await time.settle();
  // The bot queues on its own.
  expect(session.getState().quickMatch).toBe('queued');

  const human = world.client('Bo');
  human.quickMatch();
  await time.settle();
  const code = human.getState().room?.code;
  expect(session.getState().room?.code).toBe(code);
  expect(session.getState().room?.hostId).toBeUndefined();

  // The human hard-drops every half second and tops out; the bot plays on.
  for (let step = 0; !human.getState().match?.result && step < 2000; step++) {
    if (human.getState().match?.phase === 'playing' && step % 10 === 0) {
      human.act(ActionType.HardDrop, time.now());
    }
    await time.advance(STEP_MS);
  }
  const result = human.getState().match?.result;
  expect(result?.placements.map(({ playerId }) => playerId)).toEqual([
    session.getState().sessionId,
    human.getState().sessionId,
  ]);
  expect(session.getState().match?.result).toEqual(result);
  expect(ownGame(session).engine.piecesPlaced).toBeGreaterThan(3);
  const verified = world.game.verifiedGames(code ?? '');
  const server = verified.find(({ playerId }) => playerId === session.getState().sessionId);
  expect(server?.frame).toBe(ownGame(session).engine.frame);
  expect(server?.hash).toBe(ownHash(session));

  // The bot has asked to rematch: the human's ask starts the next match, and the bot plays it.
  const first = human.getState().match?.matchId;
  human.rematch();
  await time.settle();
  expect(session.getState().match?.matchId).not.toBe(first);
  for (let step = 0; session.getState().match?.phase !== 'playing' && step < 200; step++) {
    await time.advance(STEP_MS);
  }
  // About a piece a second: 10 s is plenty for a few.
  for (let step = 0; step < 10_000 / STEP_MS; step++) await time.advance(STEP_MS);
  expect(ownGame(session).engine.piecesPlaced).toBeGreaterThan(3);

  // Its opponent leaves: it queues again.
  human.leaveRoom();
  await time.settle();
  expect(session.getState().room).toBeNull();
  expect(session.getState().quickMatch).toBe('queued');
  bot.stop();
}, 120_000);
