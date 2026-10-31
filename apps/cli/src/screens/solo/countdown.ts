import type { SoloSessionState } from '@shura/client-core';
import { useState } from 'react';

/** Frames per countdown step: 0.5 s (design §13.1). */
const STEP_FRAMES = 30;

/** How long "GO" stays up once play starts: 0.5 s, one more step. */
const GO_FRAMES = 30;

/**
 * The countdown over the board: "3", "2", "1" for 0.5 s each, then "GO" for the first 0.5 s of
 * play, or `null`. Each countdown (a new game, a restart, a resume) ends at a Go, which is the frame
 * the engine waited at through it.
 */
export function useCountdownLabel(state: SoloSessionState): string | null {
  const { phase, countdown } = state;
  const { frame } = state.engine;
  const [goFrame, setGoFrame] = useState<number | null>(null);
  // Remembered from the countdown's renders, the way React stores what an earlier render saw.
  if (phase === 'countdown' && goFrame !== frame) setGoFrame(frame);
  if (phase === 'countdown') return String(Math.ceil(countdown / STEP_FRAMES));
  if (phase === 'playing' && goFrame !== null && frame - goFrame < GO_FRAMES) return 'GO';
  return null;
}
