import type { SoloSessionState } from './solo-session';

/** Frames per countdown step: 0.5 s (design §13.1). */
const STEP_FRAMES = 30;

/** How long "GO" stays up once play starts: 0.5 s, one more step. */
const GO_FRAMES = 30;

/**
 * The countdown over the board (design §13.1, Countdown): "3", "2", "1" for 0.5 s each, then "GO"
 * for the first 0.5 s of play, or `null`. Each countdown (a new game, a restart, a resume) ends at
 * its Go frame.
 */
export function countdownLabel(
  state: Pick<SoloSessionState, 'phase' | 'countdown' | 'goFrame' | 'engine'>,
): string | null {
  const { phase, countdown, goFrame, engine } = state;
  if (phase === 'countdown') return String(Math.ceil(countdown / STEP_FRAMES));
  if (phase === 'playing' && engine.frame - goFrame < GO_FRAMES) return 'GO';
  return null;
}
