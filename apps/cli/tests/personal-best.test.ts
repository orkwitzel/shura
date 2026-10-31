import type { PersonalBest, PersonalBestOutcome, RunStats } from '@shura/client-core';
import { describe, expect, it } from 'vitest';
import { personalBestLine } from '../src/personal-best';

const RUN: RunStats = {
  outcome: 'finished',
  score: 12_000,
  lines: 40,
  pieces: 100,
  level: 1,
  frames: 3_000,
};

function best(stats: Partial<RunStats>): PersonalBest {
  return {
    date: '2026-10-31T12:00:00.000Z',
    engineVersion: 1,
    seed: 7,
    stats: { ...RUN, ...stats },
    actions: [],
  };
}

function line(mode: 'sprint' | 'ultra' | 'marathon', outcome: PersonalBestOutcome) {
  return personalBestLine(mode, outcome);
}

describe('the personal best line', () => {
  it('celebrates a new personal best, the first one too', () => {
    const outcome = { kind: 'new', run: RUN, previous: null, saveProblem: null } as const;
    expect(line('sprint', outcome)).toBe('New personal best!');
    expect(line('marathon', { ...outcome, previous: best({ score: 100 }) })).toBe(
      'New personal best!',
    );
  });

  it("says how far off a Sprint best the run's time was", () => {
    const outcome = { kind: 'behind', run: RUN, best: best({ frames: 2_700 }) } as const;
    expect(line('sprint', outcome)).toBe('5.000 s off your best (0:45.000)');
  });

  it('says how far off an Ultra or Marathon best the score was', () => {
    const outcome = { kind: 'behind', run: RUN, best: best({ score: 13_250 }) } as const;
    expect(line('ultra', outcome)).toBe('1,250 points off your best (13,250)');
    expect(line('marathon', outcome)).toBe('1,250 points off your best (13,250)');
  });

  it('says when the run equalled the best', () => {
    expect(line('sprint', { kind: 'behind', run: RUN, best: best({}) })).toBe(
      'Equals your best (0:50.000)',
    );
  });

  it("says that a top-out doesn't count, with the best beside it", () => {
    const run = { ...RUN, outcome: 'gameOver' } as const;
    expect(line('sprint', { kind: 'notCounted', run, best: best({ frames: 2_700 }) })).toBe(
      "A top-out doesn't count. Your best: 0:45.000",
    );
    expect(line('ultra', { kind: 'notCounted', run, best: null })).toBe(
      "A top-out doesn't count for a personal best",
    );
  });

  it('warns when a new personal best could not be saved', () => {
    const saveProblem = "Couldn't save records.json: disk full";
    expect(line('sprint', { kind: 'new', run: RUN, previous: null, saveProblem })).toBe(
      `New personal best! ${saveProblem}`,
    );
  });
});
