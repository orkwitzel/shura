import { expect, test } from 'vitest';
import { type MatchPlayer, placements, statsOf } from '../../src/match/results';

const player = (id: string, out: MatchPlayer['out'], frame = 600): MatchPlayer => ({
  id,
  index: 0,
  frame,
  out,
  linesSent: 0,
});

test('places by the frame each player went out at, sharing a place at the same frame (§10.1)', () => {
  expect(
    placements([
      player('a', { reason: 'toppedOut', frame: 300 }),
      player('b', null),
      player('c', { reason: 'left', frame: 300 }),
      player('d', { reason: 'toppedOut', frame: 500 }),
    ]),
  ).toEqual([
    { playerId: 'b', place: 1 },
    { playerId: 'd', place: 2, reason: 'toppedOut', frame: 500 },
    { playerId: 'a', place: 3, reason: 'toppedOut', frame: 300 },
    { playerId: 'c', place: 3, reason: 'left', frame: 300 },
  ]);
});

test('stats: lines sent, attack per minute and pieces per second over the frames played', () => {
  // 1800 frames is 30 s: 12 lines is 24 APM, and 45 pieces 1.5 PPS.
  expect(statsOf({ ...player('a', null, 1800), linesSent: 12 }, 45)).toEqual({
    playerId: 'a',
    linesSent: 12,
    apm: 24,
    pps: 1.5,
  });
  expect(statsOf(player('b', null, 0), 0)).toEqual({ playerId: 'b', linesSent: 0, apm: 0, pps: 0 });
});
