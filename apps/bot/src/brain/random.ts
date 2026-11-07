import { nextRandom } from '@shura/engine';

/** A source of numbers in [0, 1), like `Math.random`. */
export type Random = () => number;

/**
 * A seeded random source, so a bot's choices can be replayed from its seed: the engine's mulberry32
 * (`nextRandom`) on a state of the bot's own. The engine's PRNG states belong to the game, and the
 * bot never draws from them.
 */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    const [value, next] = nextRandom(state);
    state = next;
    return value / 4_294_967_296;
  };
}

/** A whole number from `min` to `max`, both included. */
export function between(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}
