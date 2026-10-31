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

/** The result of a game, which the engine's state says (read it once the session has ended). */
export function soloResult({
  mode,
  engine,
}: Pick<SoloSessionState, 'mode' | 'engine'>): SoloResult {
  const { finished, score, linesCleared, piecesPlaced, level, frame } = engine;
  return {
    outcome: finished ? 'finished' : 'gameOver',
    headline: mode === 'sprint' ? { kind: 'time', frames: frame } : { kind: 'score', score },
    score,
    lines: linesCleared,
    pieces: piecesPlaced,
    piecesPerSecond: frame === 0 ? 0 : (piecesPlaced * 60) / frame,
    level,
    frames: frame,
  };
}
