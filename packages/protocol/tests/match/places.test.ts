import { expect, test } from 'vitest';
import { placeAmong } from '../../src/index';

// Four players: one still in, one out at frame 500, two out at frame 300 (design §10.1).
const OUTS = [null, 500, 300, 300];

test('a player still in outlasted everyone who went out', () => {
  expect(placeAmong(null, OUTS)).toBe(1);
});

test('later is better: one more than the players who outlasted them', () => {
  expect(placeAmong(500, OUTS)).toBe(2);
});

test('players out at the same frame share a place, and the place after a tie skips', () => {
  expect(placeAmong(300, OUTS)).toBe(3);
  expect(placeAmong(200, [...OUTS, 200])).toBe(5);
});
