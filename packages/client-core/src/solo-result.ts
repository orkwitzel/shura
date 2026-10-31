import type { ReadonlyEngineState } from '@shura/engine';
import { FRAMES_PER_SECOND } from './frames';
import type { SoloMode } from './modes';
import type { SoloSessionState } from './solo-session';

/**
 * What a results screen shows above the rest (design §13.1): Sprint's time, in frames (the UI
 * formats it), or the score in Marathon and Ultra.
 */
export type SoloHeadline =
  | { readonly kind: 'time'; readonly frames: number }
  | { readonly kind: 'score'; readonly score: number };

/** The numbers a single-player game ends with, for its results screen (design §13.1). */
export interface SoloResult {
  /**
   * `finished` when the game met its mode's end condition: Sprint's 40 lines, Marathon's 150 or
   * Ultra's 2 minutes. `gameOver` at a top-out.
   */
  readonly outcome: 'finished' | 'gameOver';
  readonly headline: SoloHeadline;
  readonly score: number;
  readonly lines: number;
  readonly pieces: number;
  /** Pieces placed per second of play since Go, 0 before the first frame. */
  readonly piecesPerSecond: number;
  readonly level: number;
  /** The frame the game ended on: its length since Go. */
  readonly frames: number;
}

/**
 * A run's headline in `mode`: Sprint's is its time, every other mode's its score. The one place
 * that says which; everything else asks the headline's `kind`.
 */
export function headlineOf(
  mode: SoloMode,
  { frames, score }: { readonly frames: number; readonly score: number },
): SoloHeadline {
  return mode === 'sprint' ? { kind: 'time', frames } : { kind: 'score', score };
}

/** Whether a game has ended, by a top-out or by finishing (the engine says which). */
export function hasEnded({ toppedOut, finished }: ReadonlyEngineState): boolean {
  return toppedOut || finished;
}

/** The frames left of a mode's time limit (Ultra's 2 minutes), down to 0, or `null` without one. */
export function timeLeft({ frame, settings }: ReadonlyEngineState): number | null {
  return settings.frameLimit === null ? null : Math.max(settings.frameLimit - frame, 0);
}

/** The result of a game, which the engine's state says (read it once the session has ended). */
export function soloResult({
  mode,
  engine,
}: Pick<SoloSessionState, 'mode' | 'engine'>): SoloResult {
  const { finished, score, linesCleared, piecesPlaced, level, frame } = engine;
  return {
    outcome: finished ? 'finished' : 'gameOver',
    headline: headlineOf(mode, { frames: frame, score }),
    score,
    lines: linesCleared,
    pieces: piecesPlaced,
    piecesPerSecond: frame === 0 ? 0 : (piecesPlaced * FRAMES_PER_SECOND) / frame,
    level,
    frames: frame,
  };
}
