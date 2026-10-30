import type { ActivePiece, Turn } from '../../src/index';

/** A turn in place, clockwise. */
export const IN_PLACE: Turn = { quarterTurns: 1, kick: [0, 0] };

/** A board, as `withBoard` reads it, and a T resting in a slot in it. */
export interface Slot {
  board: readonly string[];
  piece: ActivePiece;
}

/**
 * A T-spin double slot: the T fits pointing down under the overhang at column 2, with both front
 * corners and a back one filled.
 */
export const TSD_SLOT: Slot = {
  board: ['LL........', 'L...LLLLLL', 'LL.LLLLLLL'],
  piece: { kind: 'T', col: 1, row: 2, rotation: 2 },
};

/**
 * A mini T-spin single slot: the T points up on the floor at the left wall, with the corner above
 * its right arm filled and the floor filling its back corners.
 */
export const MINI_SLOT: Slot = {
  board: ['..L.......', '...LLLLLLL'],
  piece: { kind: 'T', col: 0, row: 1, rotation: 0 },
};

/** A T-spin triple slot: the T fits pointing right in the gap along the left wall. */
export const TST_SLOT: Slot = {
  board: ['LL........', 'L.........', 'L.LLLLLLLL', 'L..LLLLLLL', 'L.LLLLLLLL'],
  piece: { kind: 'T', col: 0, row: 2, rotation: 1 },
};
/** `TST_SLOT` with its bottom-right corner open: the T there has one front corner and both back ones. */
export const OPEN_TST_SLOT: Slot = {
  ...TST_SLOT,
  board: [...TST_SLOT.board.slice(0, -1), 'L..LLLLLLL'],
};
/** The fifth kick of a clockwise turn from 0, which puts a T in a T-spin triple slot. */
export const TST_KICK: Turn = { quarterTurns: 1, kick: [-1, -2] };
