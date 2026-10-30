import { describe, expect, test } from 'vitest';
import { type PieceKind, type Rotation, srs } from '../src/index';

type Kicks = readonly (readonly [cols: number, rows: number])[];
type KickTable = Record<string, Kicks>;

/** A transition key, as the tables below write it: from-state then to-state, `R` and `L` for 1 and 3. */
const STATE_NAMES = ['0', 'R', '2', 'L'] as const;

function key(from: Rotation, to: Rotation): string {
  return `${STATE_NAMES[from]}${STATE_NAMES[to]}`;
}

const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];

/**
 * The SRS kick tables, as the Hard Drop wiki gives them (https://harddrop.com/wiki/SRS, "Wall
 * Kicks"): x rightwards and y upwards, with the basic rotation (0, 0) as test 1.
 */
const SRS_JLSTZ: KickTable = {
  '0R': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  R0: [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  R2: [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  '2R': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  '2L': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  L2: [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  L0: [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  '0L': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
};

const SRS_I: KickTable = {
  '0R': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  R0: [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  R2: [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
  '2R': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  '2L': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  L2: [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  L0: [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  '0L': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
};

/**
 * TETR.IO's SRS+ 180 kicks, from TETR.IO's client source (https://tetr.io/js/tetrio.js, read on
 * 2026-10-30, client version 1.7.8): the `"02"`, `13`, `20` and `31` entries of `kicksets["SRS+"]`,
 * `kicks` for J, L, S, T and Z and `i_kicks` for I. That source writes y downwards and leaves out the
 * basic rotation, so here every y is negated and (0, 0) is added as test 1. For example, its
 * `"02": [[0,-1],[1,-1],[-1,-1],[1,0],[-1,0]]` is the first row below.
 */
const SRS_PLUS_180_JLSTZ: KickTable = {
  '02': [
    [0, 0],
    [0, 1],
    [1, 1],
    [-1, 1],
    [1, 0],
    [-1, 0],
  ],
  RL: [
    [0, 0],
    [1, 0],
    [1, 2],
    [1, 1],
    [0, 2],
    [0, 1],
  ],
  '20': [
    [0, 0],
    [0, -1],
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
  ],
  LR: [
    [0, 0],
    [-1, 0],
    [-1, 2],
    [-1, 1],
    [0, 2],
    [0, 1],
  ],
};

const SRS_PLUS_180_I: KickTable = {
  '02': [
    [0, 0],
    [0, 1],
  ],
  RL: [
    [0, 0],
    [1, 0],
  ],
  '20': [
    [0, 0],
    [0, -1],
  ],
  LR: [
    [0, 0],
    [-1, 0],
  ],
};

const TABLES: Record<PieceKind, KickTable> = {
  I: { ...SRS_I, ...SRS_PLUS_180_I },
  O: {},
  T: { ...SRS_JLSTZ, ...SRS_PLUS_180_JLSTZ },
  S: { ...SRS_JLSTZ, ...SRS_PLUS_180_JLSTZ },
  Z: { ...SRS_JLSTZ, ...SRS_PLUS_180_JLSTZ },
  J: { ...SRS_JLSTZ, ...SRS_PLUS_180_JLSTZ },
  L: { ...SRS_JLSTZ, ...SRS_PLUS_180_JLSTZ },
};

const TRANSITIONS = ROTATIONS.flatMap((from) =>
  ROTATIONS.filter((to) => to !== from).map((to) => ({ from, to, name: key(from, to) })),
);

describe('SRS kick lookup', () => {
  describe.each(['T', 'S', 'Z', 'J', 'L', 'I'] as const)('%s', (kind) => {
    test.each(TRANSITIONS)('$name', ({ from, to, name }) => {
      expect(srs.kicks(kind, from, to)).toEqual(TABLES[kind][name]);
    });
  });

  test.each(TRANSITIONS)("O doesn't kick: $name tries only the basic rotation", ({ from, to }) => {
    expect(srs.kicks('O', from, to)).toEqual([[0, 0]]);
  });
});
