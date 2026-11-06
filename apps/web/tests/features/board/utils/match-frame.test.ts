import type { OnlineMatchState } from '@shura/client-core';
import { ActionType, createEngine, type Engine, ONE_VS_ONE } from '@shura/engine';
import { describe, expect, test } from 'vitest';
import { layoutOpponents } from '@/features/board/utils/layout-opponents';
import {
  type BoardKey,
  boardsOf,
  type MatchLook,
  matchFrame,
} from '@/features/board/utils/match-frame';
import type { MeterFlash } from '@/features/board/utils/meter-flash';
import { matchState, playerGame } from '../../../support/fake-online-session';

const VIEWPORT = { width: 1600, height: 900, pixelRatio: 1 };

/** A 1v1 you play against `bo`, on live engines the test steps. */
function oneVsOne() {
  const engines: Record<string, Engine> = {
    me: createEngine(ONE_VS_ONE, 7, 0),
    bo: createEngine(ONE_VS_ONE, 7, 1),
  };
  const state = (change: Partial<OnlineMatchState> = {}, out: string[] = []) =>
    matchState(
      Object.entries(engines).map(([id, engine], index) =>
        playerGame(id, index, {
          engine: engine.state,
          out: out.includes(id) ? { reason: 'toppedOut', frame: engine.state.frame } : null,
        }),
      ),
      change,
    );
  return { engines, state };
}

function lookOf(change: Partial<MatchLook> = {}): MatchLook {
  return {
    theme: 'indigo',
    skin: 'pixel',
    ghost: true,
    effects: 'full',
    layout: layoutOpponents(VIEWPORT, 1, { own: true, top: 0 }),
    ...change,
  };
}

/** Plays frames of a match one after another, keeping what each needs from the one before. */
function frames(look: MatchLook) {
  const boards = boardsOf(look.layout, 'me', ['bo']);
  let keys: ReadonlyMap<string, BoardKey> = new Map();
  let flashes: ReadonlyMap<string, MeterFlash> = new Map();
  return (match: OnlineMatchState, now = 0, drawWith = look) => {
    const frame = matchFrame({ match, look: drawWith, boards, keys, flashes, now });
    keys = frame.keys;
    flashes = frame.flashes;
    return frame;
  };
}

describe('matchFrame (design §13.2, Match)', () => {
  test('paints every board the first time, yours with its effects view', () => {
    const { state } = oneVsOne();
    const frame = frames(lookOf())(state());
    expect(frame.paints.map(({ playerId }) => playerId)).toEqual(['me', 'bo']);
    expect(frame.view?.cellSize).toBe(boardsOf(lookOf().layout, 'me', ['bo'])[0]?.cellSize);
  });

  test('paints nothing again while no board has changed', () => {
    const { state } = oneVsOne();
    const next = frames(lookOf());
    next(state());
    const again = next(state(), 16);
    expect(again.paints).toEqual([]);
    expect(again.view).toBeNull();
  });

  test('paints again only the board whose game moved on a frame', () => {
    const { engines, state } = oneVsOne();
    const next = frames(lookOf());
    next(state());
    engines.bo?.step(1, []);
    expect(next(state(), 16).paints.map(({ playerId }) => playerId)).toEqual(['bo']);
  });

  test('paints again a board that goes out, and every board for a new look', () => {
    const { state } = oneVsOne();
    const look = lookOf();
    const next = frames(look);
    next(state());
    expect(next(state({}, ['bo']), 16, look).paints.map(({ playerId }) => playerId)).toEqual([
      'bo',
    ]);
    const darker = { ...look, ghost: false };
    expect(next(state({}, ['bo']), 32, darker).paints).toHaveLength(2);
  });

  test('paints a board again as an attack arrives in its meter, while it flashes', () => {
    const { engines, state } = oneVsOne();
    const next = frames(lookOf());
    next(state());
    engines.me?.step(1, [
      { frame: 1, type: ActionType.GarbageReceived, id: 4, lines: 2, holeSeed: 3 },
    ]);
    expect(next(state(), 16).paints.map(({ playerId }) => playerId)).toEqual(['me']);
    // The blink turns off 100 ms after it arrived: the board is painted again, without a frame.
    expect(next(state(), 120).paints.map(({ playerId }) => playerId)).toEqual(['me']);
  });

  test('sends streaks from the middle of a well to the top of a meter', () => {
    const { state } = oneVsOne();
    const { streaks } = frames(lookOf())(state());
    const from = streaks.origin('me');
    const to = streaks.target('bo');
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    expect(to?.x).toBeGreaterThan(from?.x ?? Number.POSITIVE_INFINITY);
    expect(streaks.origin('nobody')).toBeNull();
  });
});
