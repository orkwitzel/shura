import { FRAMES_PER_SECOND } from '../shared/frames';

/**
 * Pieces per second: the pieces a game has locked over the seconds its frames make, not rounded;
 * 0 before the first frame. Single-player's results and both UIs' match HUDs show it.
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
