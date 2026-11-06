import { COUNTDOWN_MS } from '@shura/protocol';
import { afterEach, expect, test } from 'vitest';
import {
  eventually,
  openRoom,
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

test('a player who leaves mid-match is out with `left` at their last verified frame (§10.1)', async () => {
  world = await onlineWorld();
  const { time } = world;
  const ada = world.client('Ada');
  const bo = world.client('Bo');
  const cy = world.client('Cy');
  const code = await openRoom(world, 'ffa', ada, bo, cy);
  await startMatch(world, ada, bo, cy);
  await time.advance(COUNTDOWN_MS);
  for (let step = 0; step < 10; step++) await time.advance(STEP_MS);
  expect([ada, bo, cy].every(playing)).toBe(true);

  // The online menu's Leave match sends `leaveRoom` (design §7.4).
  const cyId = cy.getState().sessionId;
  const lastFrame = verifiedGameOf(world, code, cy).frame;
  cy.leaveRoom();
  await eventually(
    world,
    () => ada.getState().match?.roster.some(({ out }) => out !== null) ?? false,
    'Cy is out',
  );

  const out = { reason: 'left', frame: lastFrame };
  for (const other of [ada, bo]) {
    expect(other.getState().match?.roster.find(({ playerId }) => playerId === cyId)).toEqual({
      playerId: cyId,
      out,
      place: 3,
    });
    // Cy is no longer in the room, and the match goes on for the other two.
    const { room } = other.getState();
    expect(
      [...(room?.players ?? []), ...(room?.spectators ?? [])].map(({ id }) => id),
    ).not.toContain(cyId);
    expect(playing(other)).toBe(true);
  }
  expect(cy.getState().room).toBeNull();
});
