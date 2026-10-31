/** A source of numbers in [0, 1), like `Math.random`. */
export type Random = () => number;

/**
 * A seeded random source (mulberry32), so a bot's choices can be replayed from its seed. It's the
 * bot's own: the engine's PRNGs belong to the game.
 */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A whole number from `min` to `max`, both included. */
export function between(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}
