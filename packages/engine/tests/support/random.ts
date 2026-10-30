import { type PieceKind, sevenBag } from '../../src/index';

/** The first `count` pieces the 7-bag deals for `seed`. */
export function draw(seed: number, count: number): PieceKind[] {
  const state = sevenBag.create(seed);
  return Array.from({ length: count }, () => sevenBag.next(state));
}
