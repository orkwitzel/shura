import { describe, expect, test } from 'vitest';
import {
  type ActivePiece,
  BOARD_HEIGHT,
  canMove,
  currentGravity,
  FFA,
  MARATHON,
  ONE_VS_ONE,
  SPRINT,
  SUBROWS_PER_ROW,
  ULTRA,
  VISIBLE_ROWS,
} from '../src/index';
import { gameOf } from './support/game';

/** Sprint's state with `piece` in play over the board `picture` (top row first). */
function stateWith(piece: ActivePiece, board: readonly string[] = []) {
  return gameOf(SPRINT, { board, piece }).state;
}

describe('canMove', () => {
  describe('at the walls', () => {
    // A vertical I (rotation 1) has its cells in box column 2: board column `col + 2`.
    const atLeftWall: ActivePiece = { kind: 'I', col: -2, row: 10, rotation: 1 };
    const atRightWall: ActivePiece = { kind: 'I', col: 7, row: 10, rotation: 1 };

    test('a piece against the left wall cannot move left but can move right', () => {
      const state = stateWith(atLeftWall);
      expect(canMove(state, -1, 0)).toBe(false);
      expect(canMove(state, 1, 0)).toBe(true);
      expect(canMove(state, 9, 0)).toBe(true);
      expect(canMove(state, 10, 0)).toBe(false);
    });

    test('a piece against the right wall cannot move right but can move left', () => {
      const state = stateWith(atRightWall);
      expect(canMove(state, 1, 0)).toBe(false);
      expect(canMove(state, -1, 0)).toBe(true);
      expect(canMove(state, -9, 0)).toBe(true);
      expect(canMove(state, -10, 0)).toBe(false);
    });
  });

  // An O's cells are the bottom-left cell of its box (`col`, `row`) and the three cells to its right
  // and below: columns `col` and `col + 1`, rows `row - 1` and `row`.
  describe('at the floor', () => {
    test('a piece on the floor cannot move down but can move sideways and up', () => {
      const state = stateWith({ kind: 'O', col: 4, row: 1, rotation: 0 });
      expect(canMove(state, 0, -1)).toBe(false);
      expect(canMove(state, -1, 0)).toBe(true);
      expect(canMove(state, 1, 0)).toBe(true);
      expect(canMove(state, 0, 1)).toBe(true);
    });

    test('a piece in the air can move down as far as the floor and no further', () => {
      const state = stateWith({ kind: 'O', col: 4, row: 5, rotation: 0 });
      expect(canMove(state, 0, -4)).toBe(true);
      expect(canMove(state, 0, -5)).toBe(false);
    });
  });

  describe('against the stack', () => {
    const stack = ['...L......', '...L......', 'LLLLLL.LLL'];

    test('a piece on the stack cannot move down, nor into the stack beside it', () => {
      const state = stateWith({ kind: 'O', col: 4, row: 2, rotation: 0 }, stack);
      expect(canMove(state, 0, -1)).toBe(false);
      expect(canMove(state, -1, 0)).toBe(false);
      expect(canMove(state, 1, 0)).toBe(true);
      expect(canMove(state, 0, 1)).toBe(true);
    });

    test('a piece in the air can move down as far as the stack and no further', () => {
      const state = stateWith({ kind: 'O', col: 4, row: 6, rotation: 0 }, stack);
      expect(canMove(state, 0, -4)).toBe(true);
      expect(canMove(state, 0, -5)).toBe(false);
    });

    test('only where the piece ends counts, not the cells it would pass', () => {
      // Left of the stack's tower: one column right overlaps it, three columns right clears it.
      const state = stateWith({ kind: 'O', col: 1, row: 2, rotation: 0 }, stack);
      expect(canMove(state, 1, 0)).toBe(false);
      expect(canMove(state, 3, 0)).toBe(true);
    });
  });

  describe('in the hidden rows', () => {
    // The second column filled from the floor up to the second hidden row.
    const tower = Array.from({ length: VISIBLE_ROWS + 2 }, () => '.L........');

    test('the stack in the hidden rows blocks a piece beside it', () => {
      const state = stateWith({ kind: 'O', col: 2, row: VISIBLE_ROWS + 1, rotation: 0 }, tower);
      expect(canMove(state, -1, 0)).toBe(false);
      expect(canMove(state, 1, 0)).toBe(true);
      expect(canMove(state, 0, -VISIBLE_ROWS)).toBe(true);
      expect(canMove(state, 0, -VISIBLE_ROWS - 1)).toBe(false);
    });

    test('a piece above the stack in the hidden rows can move over it', () => {
      const state = stateWith({ kind: 'O', col: 2, row: VISIBLE_ROWS + 3, rotation: 0 }, tower);
      expect(canMove(state, -1, 0)).toBe(true);
      expect(canMove(state, -1, -1)).toBe(false);
    });

    test('a piece at the top of the board cannot move up', () => {
      const state = stateWith({ kind: 'O', col: 4, row: BOARD_HEIGHT - 1, rotation: 0 });
      expect(canMove(state, 0, 1)).toBe(false);
      expect(canMove(state, 0, -1)).toBe(true);
    });
  });

  test('changes nothing in the game', () => {
    const engine = gameOf(SPRINT, { piece: { kind: 'O', col: 4, row: 1, rotation: 0 } });
    const before = engine.hash();
    canMove(engine.state, 0, -1);
    canMove(engine.state, 3, 2);
    expect(engine.hash()).toBe(before);
  });
});

/** 1 row/s in sub-rows per frame (design §5.1): a row is 60 × 2^16 sub-rows, a second 60 frames. */
const ONE_ROW_PER_SECOND = 65_536;

/**
 * The guideline gravity curve in sub-rows per frame (design §3): (0.8 − (level − 1) × 0.007) ^
 * (level − 1) seconds per row, as `modes.test.ts` cites it.
 */
function guidelineSubrowsPerFrame(level: number): number {
  const secondsPerRow = (0.8 - (level - 1) * 0.007) ** (level - 1);
  return SUBROWS_PER_ROW / (60 * secondsPerRow);
}

describe('currentGravity', () => {
  describe('in Marathon', () => {
    test.each(Array.from({ length: 15 }, (_, i) => ({ level: i + 1 })))(
      'at level $level is the guideline curve to the nearest sub-row',
      ({ level }) => {
        const gravity = currentGravity(gameOf(MARATHON, { level }).state);
        expect(Number.isInteger(gravity)).toBe(true);
        expect(Math.abs(gravity - guidelineSubrowsPerFrame(level))).toBeLessThanOrEqual(0.5);
      },
    );

    test('follows the level, not the time', () => {
      const state = gameOf(MARATHON, { level: 1, frame: 50_000 }).state;
      expect(currentGravity(state)).toBe(ONE_ROW_PER_SECOND);
    });
  });

  describe.each([
    { name: 'Sprint', settings: SPRINT },
    { name: 'Ultra', settings: ULTRA },
  ])('in $name', ({ settings }) => {
    test.each([0, 1_799, 1_800, 7_000])('is 1 row/s after frame %i', (frame) => {
      expect(currentGravity(gameOf(settings, { frame }).state)).toBe(ONE_ROW_PER_SECOND);
    });
  });

  describe.each([
    { name: '1v1', settings: ONE_VS_ONE },
    { name: 'FFA', settings: FFA },
  ])('in $name', ({ settings }) => {
    // 1 row/s at first, 1 row/s faster every 1,800 frames, and 20 rows/s from frame 34,200 on
    // (design §3). It is the speed the next frame falls at, so it rises a frame before a speed-up.
    test.each([
      { frame: 0, rowsPerSecond: 1 },
      { frame: 1_798, rowsPerSecond: 1 },
      { frame: 1_799, rowsPerSecond: 2 },
      { frame: 1_800, rowsPerSecond: 2 },
      { frame: 3_598, rowsPerSecond: 2 },
      { frame: 3_599, rowsPerSecond: 3 },
      { frame: 7_199, rowsPerSecond: 5 },
      { frame: 32_399, rowsPerSecond: 19 },
      { frame: 34_198, rowsPerSecond: 19 },
      { frame: 34_199, rowsPerSecond: 20 },
      { frame: 200_000, rowsPerSecond: 20 },
    ])('after frame $frame is $rowsPerSecond rows/s', ({ frame, rowsPerSecond }) => {
      const state = gameOf(settings, { frame }).state;
      expect(currentGravity(state)).toBe(rowsPerSecond * ONE_ROW_PER_SECOND);
    });
  });

  test.each([
    { name: 'a Marathon level', settings: MARATHON, setup: { level: 9 } },
    { name: 'a versus speed-up', settings: ONE_VS_ONE, setup: { frame: 1_799 } },
  ])('is the gravity the next frame builds up, at $name', ({ settings, setup }) => {
    const engine = gameOf(settings, setup);
    const gravity = currentGravity(engine.state);
    const before = engine.state.gravityCounter;
    engine.step(engine.state.frame + 1, []);
    expect(engine.state.gravityCounter).toBe((before + gravity) % SUBROWS_PER_ROW);
  });
});
