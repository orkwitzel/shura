import type { OnlinePlayerGame, OnlineSession } from '@shura/client-core';
import { type EngineState, type ReadonlyEngineState, restoreEngine } from '@shura/engine';
import type { RoomMode } from '@shura/protocol';
import type { OnlineWorld } from './online-world';

/** One loop wake per step: exactly 3 frames, a batch's worth. */
export const STEP_MS = 50;

/** A room of `mode` that `host` created, with `others` joined, every message arrived. */
export async function openRoom(
  world: OnlineWorld,
  mode: RoomMode,
  host: OnlineSession,
  ...others: OnlineSession[]
): Promise<string> {
  host.createRoom(mode);
  await world.time.settle();
  const code = host.getState().room?.code ?? '';
  for (const other of others) {
    other.joinRoom(code);
    await world.time.settle();
  }
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
  const game = world.game.verifiedGames(code).find(({ playerId }) => playerId === id);
  if (!game) throw new Error(`the server has no game of ${id}`);
  return game;
}

/** Whether the session's match is past its countdown and not over for it. */
export function playing(session: OnlineSession): boolean {
  const { match } = session.getState();
  return match?.phase === 'playing' && !ownGame(session).out && !ownGame(session).engine.toppedOut;
}
