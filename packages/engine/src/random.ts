import { assertInteger } from './assert';
import { PIECE_KINDS, type PieceKind } from './pieces';

/**
 * Advances a mulberry32 generator. The whole generator state is one 32-bit unsigned integer, so it
 * serializes as plain data and runs identically everywhere.
 */
function nextRandom(state: number): [value: number, state: number] {
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
