import type { Connect, OnlineSession } from '@shura/client-core';
import { ActionType, type GarbageReceivedAction, type PieceAction } from '@shura/engine';
import { type ClientMessage, COUNTDOWN_MS, type ServerData } from '@shura/protocol';
import type { MatchLogRecord } from '@shura/valkey';
import { afterEach, expect, test, vi } from 'vitest';
import { faultySocket, type LineMessage } from '../support/faulty-socket';
import { replayMatchLog } from '../support/match-log-replay';
import { eventually, expectVerified, openRoom, ownGame, STEP_MS } from '../support/online-games';
import { type ClientOptions, type OnlineWorld, onlineWorld } from '../support/online-world';
import { RECORDED_PIECE_ACTIONS, RECORDED_SEED } from '../support/recorded-1v1';

let world: OnlineWorld;

afterEach(async () => {
  await world.close();
});

/** How many attacks the client's own game has received. */
function receivedCount(session: OnlineSession): number {
  return ownGame(session).engine.receivedGarbageIds.length;
}

/** The `garbageReceived` actions a client sends in its input batches, recorded as they go. */
function sentReceipts(then: (connect: Connect) => Connect) {
  const received: GarbageReceivedAction[] = [];
  const through =
    (connect: Connect): Connect =>
    (url, handlers) => {
      const socket = then(connect)(url, handlers);
      return {
        send: (text) => {
          const message = JSON.parse(text) as ClientMessage;
          if (message.event === 'inputBatch') {
            for (const { actions } of message.data.frames) {
              for (const action of actions) {
                if (action.type === ActionType.GarbageReceived) {
                  received.push(action as GarbageReceivedAction);
                }
              }
            }
          }
          socket.send(text);
        },
        close: () => socket.close(),
      };
    };
  return { received, through };
}

/**
 * Where Ada stops playing the recorded 1v1 and hard-drops at once every 6 frames, so she tops out
 * within seconds and the match takes less real time than its full 10,239 frames would.
 */
const ADA_GIVES_UP = 2400;

// Each test plays about 2,500 frames over real sockets: longer than most integration tests.
vi.setConfig({ testTimeout: 60_000 });

/** Ada's moves: player 0's to `ADA_GIVES_UP`, then a hard drop every 6 frames for 30 s. */
const ADA_MOVES: readonly PieceAction[] = [
  ...(RECORDED_PIECE_ACTIONS[0] ?? []).filter(({ frame }) => frame <= ADA_GIVES_UP),
  ...Array.from(
    { length: 300 },
    (_, drop): PieceAction => ({ frame: ADA_GIVES_UP + 6 * (drop + 1), type: ActionType.HardDrop }),
  ),
];

/**
 * Ada and Bo in a 1v1 from the recorded 1v1's seed, counting down, with their moves queued at
 * their frames: Bo plays player 1's and Ada player 0's until she gives up. Their clears send
 * garbage both ways. `boOptions` are Bo's client options (his line, say).
 */
async function scriptedMatch(boOptions?: ClientOptions) {
  world = await onlineWorld({ seed: RECORDED_SEED });
  const { time } = world;
  const ada = world.client('Ada');
  const bo = world.client('Bo', boOptions);
  const code = await openRoom(world, '1v1', ada, bo);
  bo.setReady(true);
  await time.settle();
  ada.startMatch();
  // On one fake clock the offset is 0, so frame 0 starts at `startAt`, and frame f at f/60 s.
  const startAt = time.now() + COUNTDOWN_MS;
  await eventually(
    world,
    () => ada.getState().match !== null && bo.getState().match !== null,
    'the match counted down',
  );
  const queue = (session: OnlineSession, actions: readonly PieceAction[]) => {
    // Each action arrives 1 ms into the frame before its own.
    for (const { frame, type } of actions) {
      session.act(type, startAt + ((frame - 1) * 1000) / 60 + 1);
    }
  };
  queue(ada, ADA_MOVES);
  queue(bo, RECORDED_PIECE_ACTIONS[1] ?? []);
  return { ada, bo, code };
}

/** Keeps the match log as it is just before the game service deletes it. */
function keepLogOnDelete(): MatchLogRecord[] {
  const kept: MatchLogRecord[] = [];
  const log = world.stores.matchLog;
  const remove = log.delete.bind(log);
  log.delete = async (matchId) => {
    const record = await log.read(matchId);
    if (record) kept.push(record);
    await remove(matchId);
  };
  return kept;
}

/** Plays on until the match ends, `until` says to stop, or 4 minutes have passed. */
async function playOn(session: OnlineSession, until = () => false): Promise<void> {
  for (let step = 0; !session.getState().match?.result && !until() && step < 4800; step++) {
    await world.time.advance(STEP_MS);
  }
}

test('a 1v1 where both players send garbage plays to matchEnd, verified exactly, and replays from its log', async () => {
  const { ada, bo, code } = await scriptedMatch();
  const logs = keepLogOnDelete();
  await playOn(ada);

  const result = ada.getState().match?.result;
  expect(result).toBeDefined();
  expect(bo.getState().match?.result).toEqual(result);
  // Both attacked, and each received what the other sent.
  expect(receivedCount(ada)).toBeGreaterThan(5);
  expect(receivedCount(bo)).toBeGreaterThan(5);
  expect(result?.stats.every(({ linesSent }) => linesSent > 0)).toBe(true);
  // Nobody was thrown out: someone topped out.
  expect(result?.placements.map(({ reason }) => reason).filter(Boolean)).toEqual(['toppedOut']);
  expectVerified(world, code, [ada, bo]);

  // The match log, read just before its deletion, replays every player's game to the server's hash.
  await world.time.settle();
  expect(logs).toHaveLength(1);
  expect(replayMatchLog(logs[0] as MatchLogRecord)).toEqual(world.rooms.verifiedGames(code));
  const matchId = ada.getState().match?.matchId ?? '';
  expect(await world.stores.matchLog.read(matchId)).toBeUndefined();
});

test('the victim clears lines between the server sending an attack and its client receiving it, and no one is removed (ADR 0013)', async () => {
  const socket = faultySocket();
  const receipts = sentReceipts(socket.through);
  const { ada, bo, code } = await scriptedMatch({ through: receipts.through });
  const boId = () => bo.getState().sessionId;
  const isQueued = (
    message: LineMessage,
  ): message is { event: 'garbageQueued'; data: ServerData<'garbageQueued'> } =>
    message.event === 'garbageQueued';
  const heldFromBo = () =>
    socket.held('inbound').some((message) => isQueued(message) && message.data.from === boId());

  // Bo's network holds back everything from the first attack aimed at him…
  socket.hold('inbound', (message) => isQueued(message) && message.data.to === boId());
  await playOn(ada, () => socket.held('inbound').length > 0);
  const attack = socket.held('inbound')[0];
  if (!attack || !isQueued(attack)) throw new Error('Ada never attacked');
  const boFrameWhenSent = ownGame(bo).engine.frame;

  // …until Bo's own clears have sent an attack back, made after the server sent Ada's.
  await playOn(ada, heldFromBo);
  expect(heldFromBo()).toBe(true);
  const counter = ownGame(bo).engine.frame;
  expect(counter).toBeGreaterThan(boFrameWhenSent);
  socket.release('inbound');
  await playOn(ada);

  // Bo received the attack only once his own clear had been made: it wasn't cancelled by it.
  const receivedAt = receipts.received.find(({ id }) => id === attack.data.id)?.frame ?? 0;
  expect(receivedAt).toBeGreaterThan(counter);
  const result = ada.getState().match?.result;
  expect(result?.placements.map(({ reason }) => reason).filter(Boolean)).toEqual(['toppedOut']);
  expectVerified(world, code, [ada, bo]);
});

test('an attack sent while its target is away reaches them when they come back (design §8.6)', async () => {
  const line = faultySocket();
  const { ada, bo, code } = await scriptedMatch(line);
  const { time } = world;
  // Ada hears every routing of the match, Bo's included, as it's sent.
  const routed: { to: string; at: number }[] = [];
  ada.onRoutings(({ to }) => routed.push({ to, at: time.now() }));

  // Bo's line is down for 2 s out of every 4 once attacks fly (well inside the 3 s window), until
  // an attack is routed to him while he's away.
  const away: { from: number; until: number }[] = [];
  const hitWhileAway = () =>
    routed.some(
      ({ to, at }) =>
        to === bo.getState().sessionId && away.some(({ from, until }) => at > from && at < until),
    );
  let droppedAt: number | null = null;
  for (let step = 0; !ada.getState().match?.result && step < 4800; step++) {
    if (routed.length > 0 && step % 80 === 0 && droppedAt === null && !hitWhileAway()) {
      line.drop();
      droppedAt = time.now();
    }
    if (step % 80 === 40 && droppedAt !== null) {
      line.restore();
      away.push({ from: droppedAt, until: time.now() });
      droppedAt = null;
    }
    await time.advance(STEP_MS);
  }

  expect(hitWhileAway()).toBe(true);
  // Nobody was lagged out or removed: Bo took the attack in, and the match ended on a top-out.
  const result = ada.getState().match?.result;
  expect(result?.placements.map(({ reason }) => reason).filter(Boolean)).toEqual(['toppedOut']);
  expectVerified(world, code, [ada, bo]);
});
