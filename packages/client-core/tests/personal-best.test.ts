import { describe, expect, it } from 'vitest';
import { personalBestLine, personalBestSummary } from '../src/index';
import { personalBest as best, RUN } from './support/records';

describe('the personal best line', () => {
  it('celebrates a new personal best, the first one too', () => {
    const outcome = { kind: 'new', run: RUN, previous: null, saveProblem: null } as const;
    expect(personalBestLine('sprint', outcome)).toBe('New personal best!');
    expect(personalBestLine('marathon', { ...outcome, previous: best({ score: 100 }) })).toBe(
      'New personal best!',
    );
  });

  it("says how far off a Sprint best the run's time was", () => {
    const outcome = { kind: 'behind', run: RUN, best: best({ frames: 2_700 }) } as const;
    expect(personalBestLine('sprint', outcome)).toBe('5.000 s off your best (0:45.000)');
  });

  it('says how far off an Ultra or Marathon best the score was', () => {
    const outcome = { kind: 'behind', run: RUN, best: best({ score: 13_250 }) } as const;
    expect(personalBestLine('ultra', outcome)).toBe('1,250 points off your best (13,250)');
    expect(personalBestLine('marathon', outcome)).toBe('1,250 points off your best (13,250)');
  });

  it('says when the run equalled the best', () => {
    expect(personalBestLine('sprint', { kind: 'behind', run: RUN, best: best() })).toBe(
      'Equals your best (0:50.000)',
    );
  });

  it("says that a top-out doesn't count, with the best beside it", () => {
    const run = { ...RUN, outcome: 'gameOver' } as const;
    expect(
      personalBestLine('sprint', { kind: 'notCounted', run, best: best({ frames: 2_700 }) }),
    ).toBe("A top-out doesn't count. Your best: 0:45.000");
    expect(personalBestLine('ultra', { kind: 'notCounted', run, best: null })).toBe(
      "A top-out doesn't count for a personal best",
    );
  });

  it('warns when a new personal best could not be saved', () => {
    const saveProblem = "Couldn't save records.json: disk full";
    expect(personalBestLine('sprint', { kind: 'new', run: RUN, previous: null, saveProblem })).toBe(
      `New personal best! ${saveProblem}`,
    );
  });
});

describe('the personal best summary', () => {
  it("is Sprint's time, Ultra's score, and Marathon's score with its level and lines", () => {
    expect(personalBestSummary('sprint', best({ frames: 2_700 }))).toBe('0:45.000');
    expect(personalBestSummary('ultra', best({ score: 21_449 }))).toBe('21,449');
    expect(personalBestSummary('marathon', best({ score: 171_349, level: 15, lines: 150 }))).toBe(
      '171,349 (level 15, 150 lines)',
    );
  });

  it('says so when there is none yet', () => {
    expect(personalBestSummary('sprint', undefined)).toBe('no record yet');
  });
});
