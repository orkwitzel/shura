import { framesToMs } from '../shared/frames';
import type { SoloHeadline } from '../solo/solo-result';

/** A time in frames as `m:ss.mmm`, to the nearest millisecond (design §13.1). */
export function formatFrames(frames: number): string {
  const ms = Math.round(framesToMs(frames));
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/** A score with a comma between each group of thousands: `171,349`. */
export function formatScore(score: number): string {
  return String(score).replace(/\B(?=(\d{3})+$)/g, ',');
}

/** A headline as shown: its time (`0:45.000`) or its score (`21,449`). */
export function formatHeadline(headline: SoloHeadline): string {
  return headline.kind === 'time' ? formatFrames(headline.frames) : formatScore(headline.score);
}

/** A wait in milliseconds as `m:ss`, rounded down to the second: the quick-match wait. */
export function formatWait(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** How good a round trip is (design §13.2): good under 80 ms, fair under 150, poor above. */
export function pingQuality(ms: number): 'good' | 'fair' | 'poor' {
  if (ms < 80) return 'good';
  if (ms < 150) return 'fair';
  return 'poor';
}
