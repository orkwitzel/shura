import { describe, expect, it } from 'vitest';
import {
  formatFrames,
  formatHeadline,
  formatScore,
  formatWait,
  framesToMs,
  msToFrames,
  pingQuality,
} from '../../src/index';

describe('frames and milliseconds', () => {
  it('convert at 60 frames a second', () => {
    expect(framesToMs(60)).toBe(1_000);
    expect(framesToMs(1)).toBeCloseTo(16.667, 3);
    expect(msToFrames(1_000)).toBe(60);
    expect(msToFrames(167)).toBeCloseTo(10.02, 2);
  });
});

describe('formatting', () => {
  it('shows a time in frames as m:ss.mmm, to the nearest millisecond', () => {
    expect(formatFrames(0)).toBe('0:00.000');
    expect(formatFrames(1)).toBe('0:00.017');
    expect(formatFrames(7_200)).toBe('2:00.000');
    expect(formatFrames(3_661)).toBe('1:01.017');
  });

  it('shows a score with a comma between each group of thousands', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(999)).toBe('999');
    expect(formatScore(171_349)).toBe('171,349');
    expect(formatScore(1_234_567)).toBe('1,234,567');
  });

  it('shows a headline as its time or its score', () => {
    expect(formatHeadline({ kind: 'time', frames: 2_700 })).toBe('0:45.000');
    expect(formatHeadline({ kind: 'score', score: 21_449 })).toBe('21,449');
  });
});

describe('the quick-match wait', () => {
  it('reads m:ss, rounding down to the second', () => {
    expect(formatWait(0)).toBe('0:00');
    expect(formatWait(9_999)).toBe('0:09');
    expect(formatWait(61_000)).toBe('1:01');
    expect(formatWait(600_000)).toBe('10:00');
  });
});

describe('ping quality (design §13.2: green under 80 ms, yellow under 150, red above)', () => {
  it.each([
    [0, 'good'],
    [79, 'good'],
    [80, 'fair'],
    [149, 'fair'],
    [150, 'poor'],
  ] as const)('%i ms is %s', (ms, quality) => {
    expect(pingQuality(ms)).toBe(quality);
  });
});
