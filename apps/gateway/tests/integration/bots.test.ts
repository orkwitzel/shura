// The one place an app imports the bot tool (design §14): its bots, on client-core's online
// session, play through the real gateway and game service.
import { BOT_PROFILES, type Bot, startBot } from '@shura/bot';
import type { OnlineSession } from '@shura/client-core';
import { ActionType } from '@shura/engine';
import { afterEach, expect, test } from 'vitest';
import { connected, expectVerified, ownGame, STEP_MS } from '../support/online-games';
import { type OnlineWorld, onlineWorld } from '../support/online-world';

let world: OnlineWorld;
let bots: Bot[] = [];

afterEach(async () => {
  for (const bot of bots) bot.stop();
  bots = [];
  await world.close();
});

/** Advances time a step at a time until `check` holds. Throws, naming `what`, if it never does. */
async function until(check: () => boolean, what: string, steps = 200): Promise<void> {
  for (let step = 0; step < steps; step++) {
    if (check()) return;
    await world.time.advance(STEP_MS);
  }
  if (!check()) throw new Error(`never: ${what}`);
}

/** The room's players as `session` sees them: nickname, kind and whether they're ready. */
const seats = (session: OnlineSession) =>
  session.getState().room?.players.map(({ nickname, kind, ready }) => [nickname, kind, ready]);

// FFA needs 8 seats (#64) and FFA garbage routing (#62): until both land, a 1v1 (ticket #61).
test('a bot and a scripted client play a 1v1 to matchEnd, and the server verified both', async () => {
  world = await onlineWorld();
  const { time } = world;
  const host = world.client('Host');
  await connected(world, host);
  host.createRoom('1v1');
  await until(() => host.getState().room !== null, 'the room was created');
  const code = host.getState().room?.code ?? '';

  // The bot joins on its own, as a `bot`, and readies up a moment later.
  const ada = world.client('Ada', { kind: 'bot' });
  bots.push(
    startBot({
      session: ada,
      clock: time,
      profile: BOT_PROFILES.casual,
      seed: 1,
      target: { room: code },
    }),
  );
  await until(() => host.getState().room?.players[1]?.ready === true, 'the bot readied up');
  expect(seats(host)).toEqual([
    ['Host', 'guest', false],
    ['Ada', 'bot', true],
  ]);

  host.startMatch();
  await time.settle();
  // The host hard-drops a piece every 1.5 s and tops out; the bot plays on, about a piece a second.
  let step = 0;
  await until(
    () => {
      if (host.getState().match?.phase === 'playing' && step++ % 30 === 0) {
        host.act(ActionType.HardDrop, time.now());
      }
      return host.getState().match?.result != null;
    },
    'the match ended',
    20 * 60,
  );

  const result = host.getState().match?.result;
  expect(result?.placements.map(({ playerId }) => playerId)).toEqual([
    ada.getState().sessionId,
    host.getState().sessionId,
  ]);
  expect(ada.getState().match?.result).toEqual(result);
  // Every piece the bot placed went through the input engine, and the server verified its game.
  expectVerified(world, code, [host, ada]);
  const bot = ownGame(ada).engine;
  expect(bot.toppedOut).toBe(false);
  expect(bot.piecesPlaced).toBeGreaterThan(8);
  expect(bot.linesCleared).toBeGreaterThan(0);

  // Back in the lobby, it readies up again for the next match.
  expect(host.getState().room?.phase).toBe('lobby');
  await until(() => host.getState().room?.players[1]?.ready === true, 'the bot readied again');
});

test('a bot sent to a room that does not exist stops, and closes its session', async () => {
  world = await onlineWorld();
  const ada = world.client('Ada', { kind: 'bot' });
  const ended: string[] = [];
  bots.push(
    startBot({
      session: ada,
      clock: world.time,
      profile: BOT_PROFILES.casual,
      seed: 1,
      target: { room: 'ZZZZ' },
      ended: (end) => ended.push(end),
    }),
  );
  await until(() => ended.length > 0, 'the bot stopped');
  expect(ended).toEqual(['refused']);
  expect(ada.getState().connection.status).toBe('closed');
});

test('a quick-match bot pairs with a scripted client, plays, rematches, and requeues', async () => {
  world = await onlineWorld();
  const { time } = world;
  const ada = world.client('Ada', { kind: 'bot' });
  bots.push(
    startBot({
      session: ada,
      clock: time,
      profile: BOT_PROFILES.casual,
      seed: 7,
      target: { quickMatch: true },
    }),
  );
  // The bot queues on its own.
  await until(() => ada.getState().quickMatch === 'queued', 'the bot queued');

  const bo = world.client('Bo');
  await connected(world, bo);
  bo.quickMatch();
  await until(() => bo.getState().room?.players.length === 2, 'the two are paired');
  const code = bo.getState().room?.code ?? '';
  expect(ada.getState().room?.code).toBe(code);
  expect(ada.getState().room?.quickMatch).toBe(true);

  // Bo hard-drops every half second and tops out; the bot plays on.
  let step = 0;
  await until(
    () => {
      if (bo.getState().match?.phase === 'playing' && step++ % 10 === 0) {
        bo.act(ActionType.HardDrop, time.now());
      }
      return bo.getState().match?.result != null && ada.getState().match?.result != null;
    },
    'the first match ended',
    20 * 60,
  );
  expect(bo.getState().match?.result?.placements.map(({ playerId }) => playerId)).toEqual([
    ada.getState().sessionId,
    bo.getState().sessionId,
  ]);
  expect(ownGame(ada).engine.piecesPlaced).toBeGreaterThan(3);
  expectVerified(world, code, [ada, bo]);

  // The bot asks for a rematch a moment after the results: Bo's ask starts the next match.
  const first = bo.getState().match?.matchId;
  bo.rematch();
  await until(() => ada.getState().match?.matchId !== first, 'the rematch started');
  await until(() => ada.getState().match?.phase === 'playing', 'the rematch is playing');
  // About a piece a second: 10 s is plenty for a few.
  const before = ownGame(ada).engine.piecesPlaced;
  for (let wait = 0; wait < 10_000 / STEP_MS; wait++) await time.advance(STEP_MS);
  expect(ownGame(ada).engine.piecesPlaced).toBeGreaterThan(before + 3);

  // Bo leaves mid-match: the bot wins it, hears its opponent left, and queues again.
  bo.leaveRoom();
  await until(() => ada.getState().quickMatch === 'queued', 'the bot queued again');
  expect(ada.getState().room).toBeNull();
  expect(ada.getState().match?.result?.placements[0]?.playerId).toBe(ada.getState().sessionId);
});
