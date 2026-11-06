import { describe, expect, it } from 'vitest';
import { piecesPerSecond } from '../../src/index';

describe('piecesPerSecond', () => {
  it('is the pieces locked over the seconds the frames make, not rounded', () => {
    expect(piecesPerSecond({ piecesPlaced: 3, frame: 120 })).toBe(1.5);
    expect(piecesPerSecond({ piecesPlaced: 1, frame: 90 })).toBeCloseTo(0.6667, 4);
  });

  it('is 0 before the first frame', () => {
    expect(piecesPerSecond({ piecesPlaced: 0, frame: 0 })).toBe(0);
  });
});
