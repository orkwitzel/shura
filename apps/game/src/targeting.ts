import { nextRandom } from '@shura/engine';

/**
 * A match's RNG (design §4, §8.5): it draws the target of each FFA attack. Its whole state is one
 * 32-bit unsigned integer, seeded from the match seed and advanced in place. The draws happen in
 * the order the server verifies attacks, which depends on network timing, so the match log
 * records each routing rather than relying on the seed to reproduce them.
 */
export interface MatchRng {
  state: number;
}

/**
 * A match RNG seeded from the match seed. The constant moves it away from the bag RNG, which starts
 * from the match seed itself, and from every player's garbage RNG.
 */
export function createMatchRng(seed: number): MatchRng {
  return { state: (seed ^ 0x85ebca6b) >>> 0 };
}

/**
 * Whom an attack goes to (design §8.5): one of `candidates`, the players not yet declared out
 * other than the attacker, drawn with the match RNG. With one left, always that one, so a 1v1 (or
 * an FFA down to two) never draws. With none, no one: the attack is dropped.
 */
export function chooseTarget<Id>(rng: MatchRng, candidates: readonly Id[]): Id | undefined {
  if (candidates.length <= 1) return candidates[0];
  const [value, state] = nextRandom(rng.state);
  rng.state = state;
  // `%` is biased by under 2^-29 with at most 7 candidates, which is irrelevant here.
  return candidates[value % candidates.length];
}
