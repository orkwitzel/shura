/** Frames a second: game time is counted in frames of 1/60 s (design §5.1). */
export const FRAMES_PER_SECOND = 60;

/** `frames` as milliseconds, not rounded. */
export function framesToMs(frames: number): number {
  return (frames * 1000) / FRAMES_PER_SECOND;
}

/** `ms` milliseconds as frames, not rounded. */
export function msToFrames(ms: number): number {
  return (ms * FRAMES_PER_SECOND) / 1000;
}
