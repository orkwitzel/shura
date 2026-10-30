import { assertInteger } from './assert';
import { PIECE_KINDS, type PieceKind } from './pieces';

/**
 * Advances a mulberry32 generator. The whole generator state is one 32-bit unsigned integer, so it
 * serializes as plain data and runs identically everywhere.
 */
export function nextRandom(state: number): [value: number, state: number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), next | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [(t ^ (t >>> 14)) >>> 0, next];
}

/**
 * Produces the piece sequence (design §4). The state is plain data owned by the engine state, and
 * `next` advances it in place, so a copied state continues the same sequence.
 */
export interface Randomizer<State> {
  create(seed: number): State;
  next(state: State): PieceKind;
}

export interface HoleSeedsState {
  rng: number;
}

/**
 * A player's garbage RNG (design §3, §8.5): it deals the hole seed of each attack queued on that
 * player, so the hole moves to a seeded random column between attacks. Whoever queues garbage, the
 * server or a test harness, keeps one per player, seeded from the match seed and the player's
 * index, so each player's is seeded separately. The state is plain data, advanced in place.
 */
export const holeSeeds = {
  create(seed: number, playerIndex: number): HoleSeedsState {
    assertInteger('seed', seed, 0, 0xffffffff);
    assertInteger('playerIndex', playerIndex, 0);
    // Mixes the player in with the golden-ratio constant, so that neighbouring players' and
    // neighbouring seeds' generators start far apart.
    return { rng: (seed ^ Math.imul(playerIndex + 1, 0x9e3779b9)) >>> 0 };
  },

  /** The next hole seed: a 32-bit unsigned integer. */
  next(state: HoleSeedsState): number {
    const [value, rng] = nextRandom(state.rng);
    state.rng = rng;
    return value;
  },
};

export interface SevenBagState {
  rng: number;
  /** The pieces left in the current bag, in draw order. */
  bag: PieceKind[];
}

/** Deals the seven pieces in a seeded random order, then the next seven, and so on. */
export const sevenBag: Randomizer<SevenBagState> = {
  create(seed) {
    assertInteger('seed', seed, 0, 0xffffffff);
    return { rng: seed, bag: [] };
  },

  next(state) {
    if (state.bag.length === 0) {
      const bag: PieceKind[] = [...PIECE_KINDS];
      // Fisher–Yates. `% (i + 1)` is biased by under 2^-29, which is irrelevant here.
      for (let i = bag.length - 1; i > 0; i--) {
        const [value, rng] = nextRandom(state.rng);
        state.rng = rng;
        const j = value % (i + 1);
        [bag[i], bag[j]] = [bag[j] as PieceKind, bag[i] as PieceKind];
      }
      state.bag = bag;
    }
    return state.bag.shift() as PieceKind;
  },
};
