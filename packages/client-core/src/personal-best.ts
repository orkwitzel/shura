import { formatHeadline, formatScore } from './format';
import { framesToMs } from './frames';
import type { SoloMode } from './modes';
import type { PersonalBest, PersonalBestOutcome } from './records';
import { headlineOf } from './solo-result';

/**
 * The results screen's personal best line (design §13.1): "new personal best", or how far off it
 * the run was. Sprint compares times, Ultra and Marathon scores.
 */
export function personalBestLine(mode: SoloMode, outcome: PersonalBestOutcome): string {
  switch (outcome.kind) {
    case 'new':
      return outcome.saveProblem
        ? `New personal best! ${outcome.saveProblem}`
        : 'New personal best!';
    case 'behind': {
      const { run, best } = outcome;
      const headline = headlineOf(mode, best.stats);
      const shown = formatHeadline(headline);
      const timed = headline.kind === 'time';
      const off = timed ? run.frames - best.stats.frames : best.stats.score - run.score;
      if (off === 0) return `Equals your best (${shown})`;
      const by = timed ? `${(framesToMs(off) / 1000).toFixed(3)} s` : `${formatScore(off)} points`;
      return `${by} off your best (${shown})`;
    }
    case 'notCounted': {
      const { best } = outcome;
      if (!best) return "A top-out doesn't count for a personal best";
      return `A top-out doesn't count. Your best: ${formatHeadline(headlineOf(mode, best.stats))}`;
    }
  }
}

/**
 * A mode's personal best as a menu shows it beside the mode (design §13.3): its headline, and for
 * Marathon the level and lines it reached too, or "no record yet".
 */
export function personalBestSummary(mode: SoloMode, best: PersonalBest | undefined): string {
  if (!best) return 'no record yet';
  const shown = formatHeadline(headlineOf(mode, best.stats));
  if (mode !== 'marathon') return shown;
  return `${shown} (level ${best.stats.level}, ${best.stats.lines} lines)`;
}
