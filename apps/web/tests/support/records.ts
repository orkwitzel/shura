import type { PersonalBest, RunStats } from '@shura/client-core';

/** A finished Sprint run's stats, for tests to change what they need. */
export const RUN: RunStats = {
  outcome: 'finished',
  score: 12_000,
  lines: 40,
  pieces: 100,
  level: 1,
  frames: 3_000,
};

/** A personal best with `stats` changed from `RUN`. */
export function personalBest(stats: Partial<RunStats> = {}): PersonalBest {
  return {
    date: '2026-10-31T12:00:00.000Z',
    engineVersion: 1,
    seed: 7,
    stats: { ...RUN, ...stats },
    actions: [],
  };
}
