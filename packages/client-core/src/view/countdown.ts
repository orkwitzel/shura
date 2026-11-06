import type { OnlineMatchState } from '../online/online-match';
import type { SoloSessionState } from '../solo/solo-session';

/** Frames per countdown step in single-player: 0.5 s (design §13.1). */
const SOLO_STEP_FRAMES = 30;

/** Frames per countdown step online: 1 s, so the match's 3 s countdown shows 3, 2, 1. */
const MATCH_STEP_FRAMES = 60;

/** How long "GO" stays up once play starts: 0.5 s. */
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
  if (phase === 'countdown') return String(Math.ceil(countdown / SOLO_STEP_FRAMES));
  if (phase === 'playing' && engine.frame - goFrame < GO_FRAMES) return 'GO';
  return null;
}

/**
 * The countdown over your board in an online match: "3", "2", "1" for 1 s each (the room's 3 s
 * countdown, design §10.1), then "GO" for the first 0.5 s of play from frame 0, or `null`.
 * Someone watching has none.
 */
export function matchCountdownLabel(
  match: Pick<OnlineMatchState, 'phase' | 'countdown' | 'me'>,
): string | null {
  const { phase, countdown, me } = match;
  if (!me) return null;
  if (phase === 'countdown') return String(Math.ceil(countdown / MATCH_STEP_FRAMES));
  if (phase === 'playing' && me.engine.frame < GO_FRAMES) return 'GO';
  return null;
}
