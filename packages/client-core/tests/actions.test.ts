import { describe, expect, test } from 'vitest';
import { PIECE_ACTIONS } from '../src/index';

describe('PIECE_ACTIONS', () => {
  test("is every action the player makes, and neither garbage action, which they don't", () => {
    expect([...PIECE_ACTIONS].sort()).toEqual([
      'hardDrop',
      'hold',
      'moveLeft',
      'moveRight',
      'rotate180',
      'rotateCCW',
      'rotateCW',
      'softDrop',
    ]);
  });
});
