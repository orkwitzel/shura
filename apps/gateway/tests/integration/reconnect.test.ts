import type { Connect, OnlineSession } from '@shura/client-core';
import { ActionType, type PieceAction } from '@shura/engine';
import { COUNTDOWN_MS, SEAT_HOLD_MS } from '@shura/protocol';
import { expect, test } from 'vitest';
import {
  gameOf,
  hashOf,
  openRoom,
  ownGame,
  playing,
  STEP_MS,
  startMatch,
  verifiedGameOf,
} from '../support/online-games';
import { type OnlineWorld, onlineWorld } from '../support/online-world';
import { RECORDED_PIECE_ACTIONS, RECORDED_SEED } from '../support/recorded-1v1';

/**
 * Plays one step: each player in `drops` hard-drops if it's their step (every `n`th), and time
 * moves on by one step.
 */
async function step(world: OnlineWorld, count: number, drops: [OnlineSession, number][]) {
  for (const [player, every] of drops) {
    if (playing(player) && count % every === 0) player.act(ActionType.HardDrop, world.time.now());
  }
  await world.time.advance(STEP_MS);
}

/** Steps until the match has ended for every one of `sessions`, at most `limit` steps. */
async function playToEnd(
  world: OnlineWorld,
  sessions: OnlineSession[],
  drops: [OnlineSession, number][],
  from = 0,
  limit = 4000,
) {
  for (let count = from; count < from + limit; count++) {
    if (sessions.every((session) => session.getState().match?.result)) return;
    await step(world, count, drops);
  }
  throw new Error('the match never ended');
}

test('a dropped connection is retried at once, then after 250 ms, 500 ms, 1 s, then every 2 s', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  await world.time.settle();
  const line = world.line(ada);
  line.cut();
  await world.time.settle();
  expect(ada.getState().connection).toEqual({ status: 'reconnecting' });
  const dials: number[] = [line.dials];
  for (const wait of [249, 1, 499, 1, 999, 1, 1999, 1, 2000]) {
    await world.time.advance(wait);
    dials.push(line.dials);
  }
  expect(dials).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 7]);
});

test('a client whose socket drops for 1 s mid-match reconnects, plays on and is verified exactly', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const code = await openRoom(world, '1v1', ada, bo);
  await startMatch(world, ada, bo);
  const drops: [OnlineSession, number][] = [
    [ada, 8],
    [bo, 10],
  ];
  // 3 s of countdown, then 1 s of play.
  let count = 0;
  for (; count < 80; count++) await step(world, count, drops);

  world.line(ada).cut();
  await world.time.settle();
  expect(ada.getState().connection).toEqual({ status: 'reconnecting' });
  for (const end = count + 20; count < end; count++) await step(world, count, drops);
  world.line(ada).restore();
  const frameBack = ownGame(ada).engine.frame;
  for (const end = count + 20; count < end; count++) await step(world, count, drops);
  expect(ada.getState().connection).toEqual({ status: 'connected' });
  expect(ada.getState().room?.code).toBe(code);
  expect(ownGame(ada).out).toBeNull();

  await playToEnd(world, [ada, bo], drops, count);
  // She played on after coming back, and the server verified every frame of it.
  expect(ownGame(ada).engine.frame).toBeGreaterThan(frameBack);
  for (const session of [ada, bo]) {
    const server = verifiedGameOf(world, code, session);
    expect(server.frame).toBe(ownGame(session).engine.frame);
    expect(server.hash).toBe(hashOf(ownGame(session).engine));
  }
  // Each saw the other's game as the server verified it, the frames she missed included.
  const boId = bo.getState().sessionId;
  expect(hashOf(gameOf(ada, boId).engine)).toBe(verifiedGameOf(world, code, bo).hash);
  expect(hashOf(gameOf(bo, ada.getState().sessionId).engine)).toBe(
    verifiedGameOf(world, code, ada).hash,
  );
});

test('a late joiner gets a snapshot and sees the same boards as the players', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const code = await openRoom(world, '1v1', ada, bo);
  await startMatch(world, ada, bo);
  const drops: [OnlineSession, number][] = [
    [ada, 4],
    [bo, 20],
  ];
  // 3 s of countdown, then 2 s of play.
  let count = 0;
  for (; count < 100; count++) await step(world, count, drops);

  const cy = world.client('Cy');
  cy.joinRoom(code);
  await world.time.settle();
  expect(cy.getState().room?.spectators.map(({ nickname }) => nickname)).toEqual(['Cy']);
  expect(cy.getState().match?.playerId).toBeNull();
  // Straight from the snapshot: each board at its player's last verified frame.
  for (const player of [ada, bo]) {
    const id = player.getState().sessionId;
    expect(gameOf(cy, id).engine.frame).toBe(verifiedGameOf(world, code, player).frame);
    expect(gameOf(cy, id).engine.frame).toBeGreaterThan(100);
  }

  await playToEnd(world, [ada, bo, cy], drops, count);
  expect(cy.getState().match?.result).toEqual(ada.getState().match?.result);
  for (const player of [ada, bo]) {
    const seen = gameOf(cy, player.getState().sessionId).engine;
    expect(hashOf(seen)).toBe(hashOf(ownGame(player).engine));
    expect(hashOf(seen)).toBe(verifiedGameOf(world, code, player).hash);
  }
});

test('a player who drops after going out comes back to watch the rest from a snapshot', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const cy = world.client('Cy');
  const code = await openRoom(world, 'ffa', ada, bo, cy);
  await startMatch(world, ada, bo, cy);
  // Cy tops out fast, Bo a while later, and Ada outlasts both.
  const drops: [OnlineSession, number][] = [
    [ada, 30],
    [bo, 20],
    [cy, 1],
  ];
  let count = 0;
  for (; !ownGame(cy).out; count++) await step(world, count, drops);
  const cyId = cy.getState().sessionId;
  world.line(cy).cut();
  for (const end = count + 40; count < end; count++) await step(world, count, drops);
  world.line(cy).restore();
  for (const end = count + 60; count < end; count++) await step(world, count, drops);
  expect(cy.getState().connection).toEqual({ status: 'connected' });
  expect(cy.getState().sessionId).toBe(cyId);
  expect(ownGame(cy).out?.reason).toBe('toppedOut');
  expect(ada.getState().match?.result).toBeNull();

  await playToEnd(world, [ada, bo, cy], drops, count);
  expect(cy.getState().match?.result).toEqual(ada.getState().match?.result);
  for (const player of [ada, bo, cy]) {
    const seen = gameOf(cy, player.getState().sessionId).engine;
    expect(hashOf(seen)).toBe(verifiedGameOf(world, code, player).hash);
  }
});

test('a drop of 5 s lags the player out, then a snapshot, then watching to matchEnd', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const cy = world.client('Cy');
  // Three players, so the match goes on after Ada is out and she has the rest of it to watch.
  const code = await openRoom(world, 'ffa', ada, bo, cy);
  await startMatch(world, ada, bo, cy);
  const drops: [OnlineSession, number][] = [
    [ada, 8],
    [bo, 20],
    [cy, 30],
  ];
  let count = 0;
  for (; count < 80; count++) await step(world, count, drops);

  world.line(ada).cut();
  for (const end = count + 100; count < end; count++) await step(world, count, drops);
  world.line(ada).restore();
  for (const end = count + 60; count < end; count++) await step(world, count, drops);
  expect(ada.getState().connection).toEqual({ status: 'connected' });
  expect(ownGame(ada).out?.reason).toBe('laggedOut');
  expect(ada.getState().match?.result).toBeNull();
  // Her board is the server's copy of her game now: what she played offline never counted.
  expect(hashOf(ownGame(ada).engine)).toBe(verifiedGameOf(world, code, ada).hash);

  await playToEnd(world, [ada, bo, cy], drops, count);
  expect(ada.getState().match?.result).toEqual(bo.getState().match?.result);
  for (const opponent of [bo, cy]) {
    const seen = gameOf(ada, opponent.getState().sessionId).engine;
    expect(hashOf(seen)).toBe(verifiedGameOf(world, code, opponent).hash);
    expect(hashOf(seen)).toBe(hashOf(ownGame(opponent).engine));
  }
});

test('a player back after their match ended gets its result and the final boards', async () => {
  const world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const code = await openRoom(world, '1v1', ada, bo);
  await startMatch(world, ada, bo);
  const drops: [OnlineSession, number][] = [
    [ada, 8],
    [bo, 20],
  ];
  let count = 0;
  for (; count < 80; count++) await step(world, count, drops);

  // Her lag-out ends the 1v1 while she's away.
  world.line(ada).cut();
  for (const end = count + 100; count < end; count++) await step(world, count, drops);
  expect(bo.getState().match?.result).not.toBeNull();
  world.line(ada).restore();
  for (const end = count + 60; count < end; count++) await step(world, count, drops);

  expect(ada.getState().connection).toEqual({ status: 'connected' });
  expect(ada.getState().room?.phase).toBe('lobby');
  expect(ada.getState().match?.result).toEqual(bo.getState().match?.result);
  expect(ownGame(ada).out?.reason).toBe('laggedOut');
  expect(hashOf(ownGame(ada).engine)).toBe(verifiedGameOf(world, code, ada).hash);
  const seen = gameOf(ada, bo.getState().sessionId).engine;
  expect(hashOf(seen)).toBe(verifiedGameOf(world, code, bo).hash);
});

/** Two clients paired by quick match, their match counting down. */
async function quickMatched(world: OnlineWorld) {
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  ada.quickMatch();
  await world.time.settle();
  bo.quickMatch();
  await world.time.settle();
  return { ada, bo, code: ada.getState().room?.code ?? '' };
}

test('a quick-match player who drops for 1 s plays on, and the room stays together', async () => {
  const world = await onlineWorld();
  const { ada, bo, code } = await quickMatched(world);
  const drops: [OnlineSession, number][] = [
    [ada, 8],
    [bo, 20],
  ];
  let count = 0;
  for (; count < 80; count++) await step(world, count, drops);
  world.line(ada).cut();
  for (const end = count + 20; count < end; count++) await step(world, count, drops);
  world.line(ada).restore();
  await playToEnd(world, [ada, bo], drops, count);
  expect(bo.getState().quickMatch).toBe('idle');
  expect(bo.getState().room?.code).toBe(code);
  expect(ada.getState().room?.code).toBe(code);
  expect(verifiedGameOf(world, code, ada).hash).toBe(hashOf(ownGame(ada).engine));
});

test('a quick-match room breaks up only once a dropped player’s hold runs out', async () => {
  const world = await onlineWorld();
  const { ada, bo, code } = await quickMatched(world);
  const drops: [OnlineSession, number][] = [[bo, 20]];
  let count = 0;
  for (; count < 80; count++) await step(world, count, drops);
  world.line(ada).cut();
  // Lagged out, Ada loses the match; Bo sees the result, still in the room.
  for (let end = count + 200; count < end && !bo.getState().match?.result; count++) {
    await step(world, count, drops);
  }
  expect(bo.getState().match?.result?.placements[0]?.playerId).toBe(bo.getState().sessionId);
  expect(bo.getState().room?.code).toBe(code);
  expect(bo.getState().quickMatch).toBe('idle');

  await world.time.advance(SEAT_HOLD_MS - 1000);
  expect(bo.getState().room?.code).toBe(code);
  await world.time.advance(1000);
  expect(bo.getState().quickMatch).toBe('opponentLeft');
  expect(bo.getState().room).toBeNull();
});

/** Wraps a connection to note, as they arrive, the `garbageQueued` messages it carries. */
function tapGarbage(heard: { to: string; at: number }[], now: () => number) {
  return (connect: Connect): Connect =>
    (url, handlers) =>
      connect(url, {
        ...handlers,
        message: (text) => {
          const message = JSON.parse(text) as { type: string; to?: string };
          if (message.type === 'garbageQueued') heard.push({ to: message.to ?? '', at: now() });
          handlers.message(text);
        },
      });
}

test('an attack sent while its target is away reaches them when they come back', async () => {
  const world = await onlineWorld({ seed: RECORDED_SEED });
  const { time } = world;
  const heard: { to: string; at: number }[] = [];
  const ada = world.client('Ada', { through: tapGarbage(heard, time.now) });
  const bo = world.client('Bo');
  await openRoom(world, '1v1', ada, bo);
  await startMatch(world, ada, bo);
  // The recorded 1v1's moves, whose clears send garbage both ways (as in garbage.test.ts).
  const startAt = time.now() + COUNTDOWN_MS;
  const queue = (session: OnlineSession, actions: readonly PieceAction[]) => {
    for (const { frame, type } of actions) {
      session.act(type, startAt + ((frame - 1) * 1000) / 60 + 1);
    }
  };
  queue(ada, RECORDED_PIECE_ACTIONS[0] ?? []);
  queue(bo, RECORDED_PIECE_ACTIONS[1] ?? []);

  // Bo is away for 1 s out of every 6 once attacks fly, until one is routed to him while away.
  const away: { from: number; until: number }[] = [];
  const hitWhileAway = () =>
    heard.some(
      ({ to, at }) =>
        to === bo.getState().sessionId && away.some(({ from, until }) => at > from && at < until),
    );
  let cutAt: number | null = null;
  for (let step = 0; !ada.getState().match?.result && step < 4800; step++) {
    if (heard.length > 0 && step % 120 === 0 && cutAt === null && !hitWhileAway()) {
      world.line(bo).cut();
      cutAt = time.now();
    }
    if (step % 120 === 20 && cutAt !== null) {
      world.line(bo).restore();
      away.push({ from: cutAt, until: time.now() });
      cutAt = null;
    }
    await time.advance(STEP_MS);
  }
  expect(hitWhileAway()).toBe(true);
  // Nobody was lagged out or removed: the match ended on a top-out, verified exactly.
  const result = ada.getState().match?.result;
  expect(result?.placements.map(({ reason }) => reason).sort()).toEqual(['toppedOut', undefined]);
  const code = ada.getState().room?.code ?? '';
  for (const session of [ada, bo]) {
    expect(verifiedGameOf(world, code, session).hash).toBe(hashOf(ownGame(session).engine));
  }
});
