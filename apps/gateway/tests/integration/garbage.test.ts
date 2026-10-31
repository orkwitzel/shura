import type { OnlineSession } from '@shura/client-core';
import {
  ActionType,
  type EngineState,
  type GarbageReceivedAction,
  type PieceAction,
  restoreEngine,
} from '@shura/engine';
import { COUNTDOWN_MS, type ServerMessageOf } from '@shura/protocol';
import type { MatchLogRecord } from '@shura/valkey';
import { expect, test } from 'vitest';
import { heldInbound } from '../support/held-inbound';
import { replayMatchLog } from '../support/match-log-replay';
import { type ClientOptions, type OnlineWorld, onlineWorld } from '../support/online-world';
import { RECORDED_PIECE_ACTIONS, RECORDED_SEED } from '../support/recorded-1v1';

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

/** The `garbageReceived` actions in the client's own action log. */
function received(session: OnlineSession): GarbageReceivedAction[] {
  return (session.getState().match?.actions ?? []).flatMap((action) =>
    action.type === ActionType.GarbageReceived ? [action] : [],
  );
}

/**
 * Ada and Bo in a 1v1 from the recorded 1v1's seed, counting down, with each one's recorded moves
 * queued at their frames: Ada plays player 0's and Bo player 1's. `boThrough` wraps Bo's connection.
 */
async function scriptedMatch(world: OnlineWorld, boThrough?: ClientOptions['through']) {
  const { time } = world;
  const ada = world.client('Ada');
  const bo = world.client('Bo', boThrough && { through: boThrough });
  await time.settle();
  ada.createRoom('1v1');
  await time.settle();
  bo.joinRoom(ada.getState().room?.code ?? '');
  await time.settle();
  bo.setReady(true);
  await time.settle();
  ada.startMatch();
  await time.settle();
  // On one fake clock the offset is 0, so frame 0 starts at `startAt`, and frame f at f/60 s.
  const startAt = time.now() + COUNTDOWN_MS;
  const queue = (session: OnlineSession, actions: readonly PieceAction[]) => {
    // Each action arrives 1 ms into the frame before its own.
    for (const { frame, type } of actions)
      session.act(type, startAt + ((frame - 1) * 1000) / 60 + 1);
  };
  queue(ada, RECORDED_PIECE_ACTIONS[0] ?? []);
  queue(bo, RECORDED_PIECE_ACTIONS[1] ?? []);
  return { ada, bo };
}

/** Records the match log as it is just before the game service deletes it. */
function keepLogOnDelete(world: OnlineWorld) {
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
async function playOn(world: OnlineWorld, session: OnlineSession, until = () => false) {
  for (let step = 0; !session.getState().match?.result && !until() && step < 4800; step++) {
    await world.time.advance(STEP_MS);
  }
}

/** Each client's own game is the server's copy of it, frame for frame (design §14). */
function expectVerified(world: OnlineWorld, sessions: readonly OnlineSession[]) {
  const code = sessions[0]?.getState().room?.code ?? '';
  const verified = world.game.verifiedGames(code);
  for (const session of sessions) {
    const server = verified.find(({ playerId }) => playerId === session.getState().sessionId);
    expect(server?.frame).toBe(ownGame(session).engine.frame);
    expect(server?.hash).toBe(ownHash(session));
  }
}

test('a 1v1 where both players send garbage plays to matchEnd, verified exactly, and replays from its log', async () => {
  const world = await onlineWorld({ seed: RECORDED_SEED });
  const logs = keepLogOnDelete(world);
  const { ada, bo } = await scriptedMatch(world);
  await playOn(world, ada);

  const result = ada.getState().match?.result;
  expect(result).toBeDefined();
  expect(bo.getState().match?.result).toEqual(result);
  // Both attacked, and each received what the other sent.
  expect(received(ada).length).toBeGreaterThan(5);
  expect(received(bo).length).toBeGreaterThan(5);
  expect(result?.stats.every(({ linesSent }) => linesSent > 0)).toBe(true);
  // Nobody was thrown out: someone topped out.
  expect(result?.placements.map(({ reason }) => reason).filter(Boolean)).toEqual(['toppedOut']);
  expectVerified(world, [ada, bo]);

  // The match log, read just before its deletion, replays every player's game to the server's hash.
  await world.time.settle();
  expect(logs).toHaveLength(1);
  const code = ada.getState().room?.code ?? '';
  expect(replayMatchLog(logs[0] as MatchLogRecord)).toEqual(world.game.verifiedGames(code));
  expect(await world.stores.matchLog.read(ada.getState().match?.matchId ?? '')).toBeUndefined();
});

test('the victim clears lines between the server sending an attack and its client receiving it, and no one is removed (ADR 0013)', async () => {
  const world = await onlineWorld({ seed: RECORDED_SEED });
  const inbound = heldInbound();
  const { ada, bo } = await scriptedMatch(world, inbound.through);
  const boId = () => bo.getState().sessionId;
  const isQueued = (message: { type: string }): message is ServerMessageOf<'garbageQueued'> =>
    message.type === 'garbageQueued';

  // Bo's network holds back everything from the first attack aimed at him…
  inbound.holdFrom((message) => isQueued(message) && message.to === boId());
  await playOn(world, ada, () => inbound.held.length > 0);
  const attack = inbound.held[0];
  if (!attack || !isQueued(attack)) throw new Error('Ada never attacked');
  const boFrameWhenSent = ownGame(bo).engine.frame;

  // …until Bo's own clears have sent an attack back, made after the server sent Ada's.
  await playOn(world, ada, () =>
    inbound.held.some((message) => isQueued(message) && message.from === boId()),
  );
  const counter = ownGame(bo).engine.frame;
  expect(inbound.held.some((message) => isQueued(message) && message.from === boId())).toBe(true);
  expect(counter).toBeGreaterThan(boFrameWhenSent);
  inbound.release();
  await playOn(world, ada);

  // Bo received the attack only once his own clear had been made: it wasn't cancelled by it.
  const receivedAt = received(bo).find(({ id }) => id === attack.id)?.frame ?? 0;
  expect(receivedAt).toBeGreaterThan(counter);
  const result = ada.getState().match?.result;
  expect(result?.placements.map(({ reason }) => reason).filter(Boolean)).toEqual(['toppedOut']);
  expectVerified(world, [ada, bo]);
});
