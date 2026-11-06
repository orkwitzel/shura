/** Frames a second: game time is counted in frames of 1/60 s (design §5.1). */
export const FRAMES_PER_SECOND = 60;

/** `frames` as milliseconds, not rounded. */
export function framesToMs(frames: number): number {
  return (frames * 1000) / FRAMES_PER_SECOND;
}

/**
 * Pieces per second: the pieces a game has locked over the seconds its frames make, not rounded;
 * 0 before the first frame. Single-player's results and the match HUD show it.
 */
export function piecesPerSecond({
  piecesPlaced,
  frame,
}: {
  readonly piecesPlaced: number;
  readonly frame: number;
}): number {
  return frame > 0 ? (piecesPlaced * FRAMES_PER_SECOND) / frame : 0;
}

/** `ms` milliseconds as frames, not rounded. */
export function msToFrames(ms: number): number {
  return (ms * FRAMES_PER_SECOND) / 1000;
}
