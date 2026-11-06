import { COUNTDOWN_MS, LAG_OUT_MS } from '@shura/protocol';
import { afterEach, expect, test } from 'vitest';
import {
  eventually,
  expectVerified,
  openRoom,
  ownGame,
  playing,
  STEP_MS,
  startMatch,
} from '../support/online-games';
import { type OnlineWorld, onlineWorld } from '../support/online-world';
import { stallableClock } from '../support/stallable-clock';

let world: OnlineWorld;

afterEach(async () => {
  await world.close();
});

test('a client that stops sending is lagged out at 3 s, at its last verified frame (§8.4)', async () => {
  world = await onlineWorld();
  const { time } = world;
  const adaClock = stallableClock();
  const ada = world.client('Ada', { clockThrough: adaClock.through });
  const bo = world.client('Bo');
  const code = await openRoom(world, '1v1', ada, bo);
  await startMatch(world, ada, bo);
  await time.advance(COUNTDOWN_MS);
  expect(playing(ada) && playing(bo)).toBe(true);

  // A second of play, then Ada's loop freezes: her socket stays open, her batches stop.
  for (let step = 0; step < 20; step++) await time.advance(STEP_MS);
  adaClock.stall();
  await time.advance(STEP_MS);
  const lastFrame = ownGame(ada).engine.frame;
  expect(lastFrame).toBeGreaterThan(0);

  // Not yet 3 s behind.
  for (let waited = STEP_MS; waited < LAG_OUT_MS - STEP_MS; waited += STEP_MS) {
    await time.advance(STEP_MS);
  }
  expect(bo.getState().match?.roster.every(({ out }) => out === null)).toBe(true);

  for (let waited = 0; waited < 4 * STEP_MS; waited += STEP_MS) await time.advance(STEP_MS);
  await eventually(world, () => bo.getState().match?.result != null, 'the match ended');

  const adaId = ada.getState().sessionId;
  const boId = bo.getState().sessionId;
  const out = { reason: 'laggedOut', frame: lastFrame };
  expect(ownGame(ada).out).toEqual(out);
  expect(bo.getState().match?.result?.placements).toEqual([
    { playerId: boId, place: 1 },
    { playerId: adaId, place: 2, ...out },
  ]);
  expect(bo.getState().match?.roster).toEqual([
    { playerId: adaId, out, place: 2 },
    { playerId: boId, out: null, place: 1 },
  ]);
  expectVerified(world, code, [ada, bo]);
});
