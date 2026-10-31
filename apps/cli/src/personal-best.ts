import type { PersonalBestOutcome, SoloMode } from '@shura/client-core';
import { formatFrames, formatScore as points } from './format';

/**
 * The results screen's personal best line (design §13.1): "new personal best", or how far off it
 * the run was. Sprint compares times, Ultra and Marathon scores.
 */
export function personalBestLine(mode: SoloMode, outcome: PersonalBestOutcome): string {
  const timed = mode === 'sprint';
  switch (outcome.kind) {
    case 'new':
      return outcome.saveProblem
        ? `New personal best! ${outcome.saveProblem}`
        : 'New personal best!';
    case 'behind': {
      const { run, best } = outcome;
      const headline = timed ? formatFrames(best.stats.frames) : points(best.stats.score);
      const off = timed ? run.frames - best.stats.frames : best.stats.score - run.score;
      if (off === 0) return `Equals your best (${headline})`;
      const by = timed ? `${((off * 1000) / 60 / 1000).toFixed(3)} s` : `${points(off)} points`;
      return `${by} off your best (${headline})`;
    }
    case 'notCounted': {
      const { best } = outcome;
      if (!best) return "A top-out doesn't count for a personal best";
      const headline = timed ? formatFrames(best.stats.frames) : points(best.stats.score);
      return `A top-out doesn't count. Your best: ${headline}`;
    }
  }
}
