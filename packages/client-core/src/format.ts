import { framesToMs } from './frames';
import type { SoloHeadline } from './solo-result';

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
