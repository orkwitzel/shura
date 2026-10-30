import { expect } from 'vitest';
import {
  type Action,
  type ActivePiece,
  createEngine,
  type Engine,
  type EngineState,
  LOCK_DELAY,
  type PieceActionType,
  restoreEngine,
  type Turn,
} from '../../src/index';
import { withActive, withBoard } from './board';
import { TEST_SETTINGS } from './settings';

/** The seed of every game `newEngine` starts. */
const SEED = 9;

export function newEngine(): Engine {
  return createEngine(TEST_SETTINGS, SEED, 0);
}

/**
 * One lock: `piece` put in play where it rests, on `board` if given, else on the board as it is,
 * with `turn` as its last turn if given. Then `actions`, if any, apply one a frame.
 */
export interface Lock {
  board?: readonly string[];
  piece: ActivePiece;
  turn?: Turn;
  actions?: readonly PieceActionType[];
}

/** Changes the state of a fresh game. */
export type Setup = (state: EngineState) => EngineState;

/**
 * Plays each lock in turn, letting the piece's lock delay run out after its actions so it scores
 * no drop points, and returns the points each lock scored. `setup` changes the state of the fresh
 * game first.
 */
export function play(locks: readonly Lock[], setup: Setup = (state) => state) {
  let engine: Engine = restoreEngine(setup(newEngine().serialize()));
  const points: number[] = [];
  for (const { board, piece, turn, actions = [] } of locks) {
    const current = engine.serialize();
    const placed = withActive(board ? withBoard(current, board) : current, piece);
    const state = { ...placed, lastTurn: turn ?? null };
    const before = state.score;
    engine = restoreEngine(state);
    const frames = actions.map((type, index): Action => ({ frame: state.frame + index + 1, type }));
    engine.step(state.frame + actions.length + LOCK_DELAY, frames);
    expect(engine.state.piecesPlaced, 'the piece should have locked').toBe(state.piecesPlaced + 1);
    points.push(engine.state.score - before);
  }
  return { engine, points };
}
