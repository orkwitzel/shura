/**
 * The place of a player who went out at frame `out` (`null`: still in), among players who went out
 * at `outs` (design §10.1): later is better, and a player still in outlasted everyone out. It's one
 * more than the players who outlasted them, so players out at the same frame share a place, and
 * the place after a tie skips the places the tie took. The server places a match's players by it,
 * and clients show the places so far by it before `matchEnd`.
 */
export function placeAmong(out: number | null, outs: readonly (number | null)[]): number {
  const reached = (frame: number | null) => frame ?? Number.POSITIVE_INFINITY;
  return 1 + outs.filter((other) => reached(other) > reached(out)).length;
}
