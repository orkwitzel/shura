/** A time in frames (60 a second) as `m:ss.mmm`, to the nearest millisecond (design §13.1). */
export function formatFrames(frames: number): string {
  const ms = Math.round((frames * 1000) / 60);
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
