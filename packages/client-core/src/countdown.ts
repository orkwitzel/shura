import type { SoloSessionState } from './solo-session';

/** Frames per countdown step in single-player: 0.5 s (design §13.1). */
const SOLO_COUNTDOWN_STEP = 30;

/** How long "GO" stays up once play starts: 0.5 s, online too. */
const GO_FRAMES = 30;

/** What the label is worked out from: a single-player session's state, or an online match's. */
export type CountdownState = Pick<
  SoloSessionState,
  'phase' | 'countdown' | 'goFrame' | 'engine'
> & {
  /**
   * Frames per step of "3", "2", "1": 30 (0.5 s) when left out, as in single-player; an online
   * match's 3 s countdown (design §10.1) says 60.
   */
  readonly countdownStep?: number;
};

/**
 * The countdown over the board (design §13.1, Countdown): "3", "2", "1" a step each (0.5 s in
 * single-player, 1 s online), then "GO" for the first 0.5 s of play, or `null`. Each countdown (a
 * new game, a restart, a resume, a match) ends at its Go frame.
 */
export function countdownLabel(state: CountdownState): string | null {
  const { phase, countdown, goFrame, engine, countdownStep = SOLO_COUNTDOWN_STEP } = state;
  if (phase === 'countdown') return String(Math.ceil(countdown / countdownStep));
  if (phase === 'playing' && engine.frame - goFrame < GO_FRAMES) return 'GO';
  return null;
}
