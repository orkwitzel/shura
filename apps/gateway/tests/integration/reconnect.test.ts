import type { OnlineSession } from '@shura/client-core';
import { ActionType } from '@shura/engine';
import { SEAT_HOLD_MS } from '@shura/protocol';
import { afterEach, expect, test } from 'vitest';
import { type FaultySocket, faultySocket } from '../support/faulty-socket';
import {
  connected,
  eventually,
  expectVerified,
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

let world: OnlineWorld;

afterEach(async () => {
  await world.close();
});

/** Who hard-drops how often: every `n`th step. */
type Drops = [OnlineSession, number][];

/** Plays one step: each of `drops` hard-drops on their step, and time moves on by one step. */
async function step(count: number, drops: Drops): Promise<void> {
  for (const [player, every] of drops) {
    if (playing(player) && count % every === 0) player.act(ActionType.HardDrop, world.time.now());
  }
  await world.time.advance(STEP_MS);
}

/** Plays steps `from` up to `to`, and gives `to`. */
async function play(from: number, to: number, drops: Drops): Promise<number> {
  for (let count = from; count < to; count++) await step(count, drops);
  return to;
}

/** Steps until the match has ended for every one of `sessions`. */
async function playToEnd(sessions: OnlineSession[], drops: Drops, from: number): Promise<void> {
  for (let count = from; count < from + 4000; count++) {
    if (sessions.every((session) => session.getState().match?.result)) return;
    await step(count, drops);
  }
  throw new Error('the match never ended');
}

/**
 * `line` is back: steps (`drops` playing on) until its client's next try has connected it again,
 * and gives the step count reached.
 */
async function restored(
  line: FaultySocket,
  session: OnlineSession,
  from: number,
  drops: Drops,
): Promise<number> {
  line.restore();
  // The tries are at most 2 s apart.
  for (let count = from; count < from + 60; count++) {
    if (session.getState().connection.status === 'connected') return count;
    await step(count, drops);
  }
  throw new Error('never connected again');
}

test('a dropped connection is retried at once, every 250 ms until 3 s, then after 1 s, then every 2 s', async () => {
  world = await onlineWorld();
  const line = faultySocket();
  const ada = world.client('Ada', line);
  await connected(world, ada);
  line.drop();
  await world.time.settle();
  expect(ada.getState().connection).toEqual({ status: 'reconnecting' });
  // The session's POST, then one at once on the drop.
  const tries: number[] = [line.requests];
  // 1 ms short of each try, then on it: 250 ms to 3 s, 1 s later, then 2 s later twice.
  const waits = [...Array<number>(12).fill(250), 1000, 2000, 2000];
  for (const wait of waits) {
    await world.time.advance(wait - 1);
    tries.push(line.requests);
    await world.time.advance(1);
    tries.push(line.requests);
  }
  expect(tries).toEqual([2, ...waits.flatMap((_, at) => [2 + at, 3 + at])]);
});

test.each([
  [1000, 20],
  [2500, 50],
])(
  'a client whose socket drops for %i ms mid-match reconnects, plays on and is verified exactly',
  async (_ms, steps) => {
    world = await onlineWorld();
    const line = faultySocket();
    const ada = world.client('Ada', line);
    const bo = world.client('Bo');
    const code = await openRoom(world, '1v1', ada, bo);
    await startMatch(world, ada, bo);
    // Ada drops a piece every 0.8 s: at most 2 rows each, so by the check after she's back her
    // well is at most 12 rows high whatever the seed, and only the drop could put her out.
    const drops: Drops = [
      [ada, 16],
      [bo, 10],
    ];
    // 3 s of countdown, then 1 s of play.
    let count = await play(0, 80, drops);

    line.drop();
    await world.time.settle();
    expect(ada.getState().connection).toEqual({ status: 'reconnecting' });
    count = await play(count, count + steps, drops);
    // She played on locally meanwhile.
    expect(ownGame(ada).engine.frame).toBeGreaterThan(60 + steps * 3 - 6);
    count = await restored(line, ada, count, drops);
    const frameBack = ownGame(ada).engine.frame;
    count = await play(count, count + 20, drops);
    expect(ada.getState().room?.code).toBe(code);
    expect(ownGame(ada).out).toBeNull();

    await playToEnd([ada, bo], drops, count);
    // She played on after coming back, and the server verified every frame of it.
    expect(ownGame(ada).engine.frame).toBeGreaterThan(frameBack);
    expectVerified(world, code, [ada, bo]);
    // Each saw the other's game as the server verified it, the frames she missed included.
    expect(hashOf(gameOf(ada, bo.getState().sessionId).engine)).toBe(
      verifiedGameOf(world, code, bo).hash,
    );
    expect(hashOf(gameOf(bo, ada.getState().sessionId).engine)).toBe(
      verifiedGameOf(world, code, ada).hash,
    );
  },
);

test('batches held up on the way for 1 s arrive in order, and the match carries on verified', async () => {
  world = await onlineWorld();
  const line = faultySocket();
  const ada = world.client('Ada', line);
  const bo = world.client('Bo');
  const code = await openRoom(world, '1v1', ada, bo);
  await startMatch(world, ada, bo);
  const drops: Drops = [
    [ada, 8],
    [bo, 20],
  ];
  let count = await play(0, 80, drops);
  line.hold('outbound');
  const heard = gameOf(bo, ada.getState().sessionId).engine.frame;
  count = await play(count, count + 20, drops);
  // Bo has heard nothing of hers since (but what was already on its way); she played on.
  expect(gameOf(bo, ada.getState().sessionId).engine.frame).toBeLessThan(heard + 6);
  expect(ownGame(ada).engine.frame).toBeGreaterThan(heard + 50);
  expect(line.held('outbound').some(({ event }) => event === 'inputBatch')).toBe(true);
  expect(ada.getState().connection).toEqual({ status: 'connected' });
  line.release('outbound');
  await playToEnd([ada, bo], drops, count);
  expectVerified(world, code, [ada, bo]);
  expect(ada.getState().match?.result?.placements.every(({ reason }) => reason !== 'removed')).toBe(
    true,
  );
});

test('a late joiner gets a snapshot and sees the same boards as the players', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const code = await openRoom(world, '1v1', ada, bo);
  await startMatch(world, ada, bo);
  const drops: Drops = [
    [ada, 4],
    [bo, 20],
  ];
  // 3 s of countdown, then 2 s of play.
  const count = await play(0, 100, drops);

  const cy = world.client('Cy');
  await connected(world, cy);
  cy.joinRoom(code);
  await eventually(world, () => cy.getState().match !== null, 'Cy has the match');
  expect(cy.getState().room?.spectators.map(({ nickname }) => nickname)).toEqual(['Cy']);
  expect(cy.getState().match?.playerId).toBeNull();
  // Straight from the snapshot: each board at its player's last verified frame.
  for (const player of [ada, bo]) {
    const id = player.getState().sessionId;
    expect(gameOf(cy, id).engine.frame).toBe(verifiedGameOf(world, code, player).frame);
    expect(gameOf(cy, id).engine.frame).toBeGreaterThan(100);
  }

  await playToEnd([ada, bo, cy], drops, count);
  expect(cy.getState().match?.result).toEqual(ada.getState().match?.result);
  expectVerified(world, code, [ada, bo]);
  for (const player of [ada, bo]) {
    const seen = gameOf(cy, player.getState().sessionId).engine;
    expect(hashOf(seen)).toBe(hashOf(ownGame(player).engine));
    expect(hashOf(seen)).toBe(verifiedGameOf(world, code, player).hash);
  }
});

test('a player who drops after going out comes back to watch the rest from a snapshot', async () => {
  world = await onlineWorld();
  const line = faultySocket();
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const cy = world.client('Cy', line);
  const code = await openRoom(world, 'ffa', ada, bo, cy);
  await startMatch(world, ada, bo, cy);
  // Cy tops out fast, Bo a while later, and Ada outlasts both.
  const drops: Drops = [
    [ada, 30],
    [bo, 20],
    [cy, 1],
  ];
  let count = 0;
  for (; !ownGame(cy).out; count++) await step(count, drops);
  const cyId = cy.getState().sessionId;
  line.drop();
  count = await play(count, count + 40, drops);
  count = await restored(line, cy, count, drops);
  count = await play(count, count + 20, drops);
  expect(cy.getState().sessionId).toBe(cyId);
  expect(ownGame(cy).out?.reason).toBe('toppedOut');
  expect(ada.getState().match?.result).toBeNull();

  await playToEnd([ada, bo, cy], drops, count);
  expect(cy.getState().match?.result).toEqual(ada.getState().match?.result);
  expectVerified(world, code, [ada, bo, cy]);
  for (const player of [ada, bo]) {
    const seen = gameOf(cy, player.getState().sessionId).engine;
    expect(hashOf(seen)).toBe(verifiedGameOf(world, code, player).hash);
  }
});

test('a drop of 5 s lags the player out, then a snapshot, then watching to matchEnd', async () => {
  world = await onlineWorld();
  const line = faultySocket();
  const ada = world.client('Ada', line);
  const bo = world.client('Bo');
  const cy = world.client('Cy');
  // Three players, so the match goes on after Ada is out and she has the rest of it to watch.
  const code = await openRoom(world, 'ffa', ada, bo, cy);
  await startMatch(world, ada, bo, cy);
  const drops: Drops = [
    [ada, 8],
    [bo, 20],
    [cy, 30],
  ];
  let count = await play(0, 80, drops);

  line.drop();
  count = await play(count, count + 100, drops);
  expect(bo.getState().match?.players.find(({ out }) => out)?.out?.reason).toBe('laggedOut');
  count = await restored(line, ada, count, drops);
  count = await play(count, count + 20, drops);
  expect(ownGame(ada).out?.reason).toBe('laggedOut');
  expect(ada.getState().match?.result).toBeNull();
  // Her board is the server's copy of her game now: what she played offline never counted.
  expect(hashOf(ownGame(ada).engine)).toBe(verifiedGameOf(world, code, ada).hash);

  await playToEnd([ada, bo, cy], drops, count);
  expect(ada.getState().match?.result).toEqual(bo.getState().match?.result);
  expectVerified(world, code, [bo, cy]);
  for (const opponent of [bo, cy]) {
    const seen = gameOf(ada, opponent.getState().sessionId).engine;
    expect(hashOf(seen)).toBe(verifiedGameOf(world, code, opponent).hash);
    expect(hashOf(seen)).toBe(hashOf(ownGame(opponent).engine));
  }
});

test('a player back after their match ended gets its result and the final boards', async () => {
  world = await onlineWorld();
  const line = faultySocket();
  const ada = world.client('Ada', line);
  const bo = world.client('Bo');
  const code = await openRoom(world, '1v1', ada, bo);
  await startMatch(world, ada, bo);
  const drops: Drops = [
    [ada, 8],
    [bo, 20],
  ];
  let count = await play(0, 80, drops);

  // Her lag-out ends the 1v1 while she's away.
  line.drop();
  count = await play(count, count + 100, drops);
  expect(bo.getState().match?.result).not.toBeNull();
  count = await restored(line, ada, count, drops);
  await play(count, count + 20, drops);

  expect(ada.getState().room?.phase).toBe('lobby');
  expect(ada.getState().match?.result).toEqual(bo.getState().match?.result);
  expect(ownGame(ada).out?.reason).toBe('laggedOut');
  expect(hashOf(ownGame(ada).engine)).toBe(verifiedGameOf(world, code, ada).hash);
  expectVerified(world, code, [bo]);
  const seen = gameOf(ada, bo.getState().sessionId).engine;
  expect(hashOf(seen)).toBe(verifiedGameOf(world, code, bo).hash);
});

/** Two clients paired by quick match, their match counting down, Ada through `line`. */
async function quickMatched(line: FaultySocket) {
  const ada = world.client('Ada', line);
  const bo = world.client('Bo');
  await connected(world, ada, bo);
  ada.quickMatch();
  await eventually(world, () => ada.getState().quickMatch === 'queued', 'Ada queued');
  bo.quickMatch();
  await eventually(
    world,
    () => ada.getState().match !== null && bo.getState().match !== null,
    'both have the match',
  );
  return { ada, bo, code: ada.getState().room?.code ?? '' };
}

test('a quick-match player who drops for 1 s plays on, and the room stays together', async () => {
  world = await onlineWorld();
  const line = faultySocket();
  const { ada, bo, code } = await quickMatched(line);
  const drops: Drops = [
    [ada, 8],
    [bo, 20],
  ];
  let count = await play(0, 80, drops);
  line.drop();
  count = await play(count, count + 20, drops);
  count = await restored(line, ada, count, drops);
  await playToEnd([ada, bo], drops, count);
  expect(bo.getState().quickMatch).toBe('idle');
  expect(bo.getState().room?.code).toBe(code);
  expect(ada.getState().room?.code).toBe(code);
  expectVerified(world, code, [ada, bo]);
});

test('a quick-match room breaks up only once a dropped player’s hold runs out', async () => {
  world = await onlineWorld();
  const line = faultySocket();
  const { ada, bo, code } = await quickMatched(line);
  const drops: Drops = [[bo, 20]];
  let count = await play(0, 80, drops);
  line.drop();
  // Lagged out, Ada loses the match; Bo sees the result, still in the room.
  for (const end = count + 200; count < end && !bo.getState().match?.result; count++) {
    await step(count, drops);
  }
  expect(bo.getState().match?.result?.placements[0]?.playerId).toBe(bo.getState().sessionId);
  expectVerified(world, code, [bo]);
  expect(bo.getState().room?.code).toBe(code);
  expect(bo.getState().quickMatch).toBe('idle');
  expect(ada.getState().connection).toEqual({ status: 'reconnecting' });

  await world.time.advance(SEAT_HOLD_MS - 1000);
  expect(bo.getState().room?.code).toBe(code);
  await world.time.advance(1000);
  expect(bo.getState().quickMatch).toBe('opponentLeft');
  expect(bo.getState().room).toBeNull();
});
