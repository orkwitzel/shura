import type { OnlinePlayerGame, OnlineSession } from '@shura/client-core';
import { type EngineState, type ReadonlyEngineState, restoreEngine } from '@shura/engine';
import type { RoomMode } from '@shura/protocol';
import { expect } from 'vitest';
import type { OnlineWorld } from './online-world';

/** One loop wake per step: exactly 3 frames, a batch's worth. */
export const STEP_MS = 50;

/**
 * Settles until `check` holds, without game time moving: for a step whose answer has to travel
 * through both apps on a busy machine. Throws, naming `what`, if it never does.
 */
export async function eventually(
  world: OnlineWorld,
  check: () => boolean,
  what: string,
): Promise<void> {
  for (let tries = 0; tries < 200; tries++) {
    await world.time.settle();
    if (check()) return;
  }
  throw new Error(`never: ${what}`);
}

/** Waits until every client has connected (or failed), every message arrived. */
export function connected(world: OnlineWorld, ...sessions: OnlineSession[]): Promise<void> {
  return eventually(
    world,
    () => sessions.every((session) => session.getState().connection.status !== 'connecting'),
    'every client connected',
  );
}

/** A room of `mode` that `host` created, with `others` joined, every message arrived. */
export async function openRoom(
  world: OnlineWorld,
  mode: RoomMode,
  host: OnlineSession,
  ...others: OnlineSession[]
): Promise<string> {
  await connected(world, host, ...others);
  host.createRoom(mode);
  await eventually(world, () => host.getState().room !== null, 'the room was created');
  const code = host.getState().room?.code ?? '';
  for (const other of others) {
    other.joinRoom(code);
    await eventually(world, () => other.getState().room?.code === code, `joined ${code}`);
  }
  // Everyone has heard of everyone who joined.
  const members = () =>
    (host.getState().room?.players.length ?? 0) + (host.getState().room?.spectators.length ?? 0);
  await eventually(world, () => members() === others.length + 1, 'everyone is in the room');
  return code;
}

/** `ready` ready up, then `host` starts the match. */
export async function startMatch(
  world: OnlineWorld,
  host: OnlineSession,
  ...ready: OnlineSession[]
): Promise<void> {
  for (const player of ready) player.setReady(true);
  await world.time.settle();
  host.startMatch();
  await world.time.settle();
}

/** `playerId`'s game as `session` sees it in its current match. */
export function gameOf(session: OnlineSession, playerId: string | null): OnlinePlayerGame {
  const game = session.getState().match?.players.find((other) => other.playerId === playerId);
  if (!game) throw new Error(`no game of ${playerId} in this match`);
  return game;
}

/** Your own game in the session's current match. */
export function ownGame(session: OnlineSession): OnlinePlayerGame {
  return gameOf(session, session.getState().sessionId);
}

/** The hash of an engine state, as the server hashes its copies. */
export function hashOf(state: ReadonlyEngineState): string {
  return restoreEngine(structuredClone(state) as EngineState).hash();
}

/** The server's verified copy of `session`'s game in the room's current or last match. */
export function verifiedGameOf(world: OnlineWorld, code: string, session: OnlineSession) {
  const id = session.getState().sessionId;
  const game = world.rooms.verifiedGames(code).find(({ playerId }) => playerId === id);
  if (!game) throw new Error(`the server has no game of ${id}`);
  return game;
}

/**
 * Checks that each session's own game is the server's verified copy of it, frame for frame and
 * hash for hash, in the room's current or last match: how every integration match ends (design
 * §14). Pass only sessions still in the room whose games the server verified to their end.
 */
export function expectVerified(
  world: OnlineWorld,
  code: string,
  sessions: readonly OnlineSession[],
): void {
  for (const session of sessions) {
    const server = verifiedGameOf(world, code, session);
    const own = ownGame(session).engine;
    expect(server.frame).toBe(own.frame);
    expect(server.hash).toBe(hashOf(own));
  }
}

/** Whether the session's match is past its countdown and not over for it. */
export function playing(session: OnlineSession): boolean {
  const { match } = session.getState();
  return match?.phase === 'playing' && !ownGame(session).out && !ownGame(session).engine.toppedOut;
}
