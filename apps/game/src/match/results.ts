import { FRAMES_PER_SECOND, type OutReason, placeAmong, type ServerData } from '@shura/protocol';

/** What the results need of a match's player. */
export interface MatchPlayer {
  readonly id: string;
  readonly index: number;
  /** The last frame verified. */
  readonly frame: number;
  /** How and when they went out, once they have. */
  out: { readonly reason: OutReason; readonly frame: number } | null;
  /** The garbage lines their clears sent, after cancelling (design §8.5). */
  linesSent: number;
}

/**
 * Places by the frame each player went out at, later being better, and players still in first
 * (design §10.1). Players out at the same frame share a place, and the place after a tie skips
 * the places the tie took.
 */
export function placements(players: readonly MatchPlayer[]): ServerData<'matchEnd'>['placements'] {
  const outs = players.map(({ out }) => out?.frame ?? null);
  return players
    .map(({ id, out }) => {
      const place = placeAmong(out?.frame ?? null, outs);
      return { playerId: id, place, ...(out && { reason: out.reason, frame: out.frame }) };
    })
    .sort((a, b) => a.place - b.place);
}

/** Two decimals, which is all the results show. */
const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Lines sent, attack per minute and pieces per second over the frames the player played (design
 * §10.1, Results). Stats for people, not rules, so they may be fractions.
 */
export function statsOf(
  { id, frame, linesSent }: MatchPlayer,
  piecesPlaced: number,
): ServerData<'matchEnd'>['stats'][number] {
  const minutes = frame / (FRAMES_PER_SECOND * 60);
  return {
    playerId: id,
    linesSent,
    apm: minutes > 0 ? round(linesSent / minutes) : 0,
    pps: frame > 0 ? round((piecesPlaced * FRAMES_PER_SECOND) / frame) : 0,
  };
}
