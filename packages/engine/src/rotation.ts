import type { PieceKind } from './pieces';

/** A piece's rotation state: 0 at spawn, then 1 (R), 2 and 3 (L) clockwise. */
export type Rotation = 0 | 1 | 2 | 3;

/** A cell offset or a kick: columns rightwards and rows upwards. */
export type Offset = readonly [cols: number, rows: number];

/**
 * How pieces turn (design §3, §4): each piece's cell offsets in each rotation state, and the kicks a turn
 * tries. The engine places the turned piece at the first kick where it fits, and if none fits the
 * piece doesn't turn.
 */
export interface RotationSystem {
  /** The cells of `kind` in `rotation`, as offsets from the piece's origin. */
  cellOffsets(kind: PieceKind, rotation: Rotation): readonly Offset[];
  /**
   * The translations a turn of `kind` from `from` to `to` tries, in order. The first is (0, 0),
   * the turn in place.
   */
  kicks(kind: PieceKind, from: Rotation, to: Rotation): readonly Offset[];
}

/** `rotation` turned clockwise by `quarterTurns` (1 clockwise, 2 a half turn, 3 anticlockwise). */
export function turned(rotation: Rotation, quarterTurns: 1 | 2 | 3): Rotation {
  return ((rotation + quarterTurns) % 4) as Rotation;
}

/**
 * Cell offsets from the origin in rotation state 0. Every piece spawns flat side down with its
 * origin in column 4, so I and O sit in the middle columns and the rest in the left-middle columns.
 */
const SPAWN_OFFSETS: Record<PieceKind, readonly Offset[]> = {
  I: [
    [-1, 0],
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  O: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  T: [
    [-1, 0],
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  S: [
    [-1, 0],
    [0, 0],
    [0, 1],
    [1, 1],
  ],
  Z: [
    [-1, 1],
    [0, 1],
    [0, 0],
    [1, 0],
  ],
  J: [
    [-1, 1],
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
  L: [
    [1, 1],
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
};

/**
 * Where a quarter turn clockwise moves the cell at (x, y): to (y + cols, rows − x). SRS turns J, L,
 * S, T and Z about the centre of the origin cell, I about the corner below and right of it (the
 * centre of its 4 × 4 box) and O about the corner above and right of it, so O never changes cells.
 */
const QUARTER_TURN_SHIFT: Record<PieceKind, Offset> = {
  I: [1, 0],
  O: [0, 1],
  T: [0, 0],
  S: [0, 0],
  Z: [0, 0],
  J: [0, 0],
  L: [0, 0],
};

function turnedOffsets(kind: PieceKind, offsets: readonly Offset[]): readonly Offset[] {
  const [cols, rows] = QUARTER_TURN_SHIFT[kind];
  return offsets.map(([x, y]) => [y + cols, rows - x]);
}

/** A piece's cell offsets in rotation states 0 to 3. */
function srsOffsets(kind: PieceKind): readonly (readonly Offset[])[] {
  const spawn = SPAWN_OFFSETS[kind];
  const right = turnedOffsets(kind, spawn);
  const two = turnedOffsets(kind, right);
  return [spawn, right, two, turnedOffsets(kind, two)];
}

const SRS_OFFSETS: Record<PieceKind, readonly (readonly Offset[])[]> = {
  I: srsOffsets('I'),
  O: srsOffsets('O'),
  T: srsOffsets('T'),
  S: srsOffsets('S'),
  Z: srsOffsets('Z'),
  J: srsOffsets('J'),
  L: srsOffsets('L'),
};

type KickTable = Partial<Record<`${Rotation}${Rotation}`, readonly Offset[]>>;

/** Kicks written as the SRS references write them, e.g. `(0,0) (-1,0) (-1,+1)`. */
function parseKicks(text: string): Offset[] {
  return [...text.matchAll(/\(([-+]?\d),([-+]?\d)\)/g)].map(([, x, y]) => [Number(x), Number(y)]);
}

/**
 * The guideline SRS kicks for J, L, S, T and Z, and TETR.IO's SRS+ 180 kicks for them. Keys are
 * from-state then to-state. The tests cite the sources.
 */
const JLSTZ_KICKS: KickTable = {
  '01': parseKicks('(0,0) (-1,0) (-1,+1) (0,-2) (-1,-2)'),
  '10': parseKicks('(0,0) (+1,0) (+1,-1) (0,+2) (+1,+2)'),
  '12': parseKicks('(0,0) (+1,0) (+1,-1) (0,+2) (+1,+2)'),
  '21': parseKicks('(0,0) (-1,0) (-1,+1) (0,-2) (-1,-2)'),
  '23': parseKicks('(0,0) (+1,0) (+1,+1) (0,-2) (+1,-2)'),
  '32': parseKicks('(0,0) (-1,0) (-1,-1) (0,+2) (-1,+2)'),
  '30': parseKicks('(0,0) (-1,0) (-1,-1) (0,+2) (-1,+2)'),
  '03': parseKicks('(0,0) (+1,0) (+1,+1) (0,-2) (+1,-2)'),
  '02': parseKicks('(0,0) (0,+1) (+1,+1) (-1,+1) (+1,0) (-1,0)'),
  '13': parseKicks('(0,0) (+1,0) (+1,+2) (+1,+1) (0,+2) (0,+1)'),
  '20': parseKicks('(0,0) (0,-1) (-1,-1) (+1,-1) (-1,0) (+1,0)'),
  '31': parseKicks('(0,0) (-1,0) (-1,+2) (-1,+1) (0,+2) (0,+1)'),
};

/** The guideline SRS kicks for I, and TETR.IO's SRS+ 180 kicks for I. */
const I_KICKS: KickTable = {
  '01': parseKicks('(0,0) (-2,0) (+1,0) (-2,-1) (+1,+2)'),
  '10': parseKicks('(0,0) (+2,0) (-1,0) (+2,+1) (-1,-2)'),
  '12': parseKicks('(0,0) (-1,0) (+2,0) (-1,+2) (+2,-1)'),
  '21': parseKicks('(0,0) (+1,0) (-2,0) (+1,-2) (-2,+1)'),
  '23': parseKicks('(0,0) (+2,0) (-1,0) (+2,+1) (-1,-2)'),
  '32': parseKicks('(0,0) (-2,0) (+1,0) (-2,-1) (+1,+2)'),
  '30': parseKicks('(0,0) (+1,0) (-2,0) (+1,-2) (-2,+1)'),
  '03': parseKicks('(0,0) (-1,0) (+2,0) (-1,+2) (+2,-1)'),
  '02': parseKicks('(0,0) (0,+1)'),
  '13': parseKicks('(0,0) (+1,0)'),
  '20': parseKicks('(0,0) (0,-1)'),
  '31': parseKicks('(0,0) (-1,0)'),
};

/** O turns only in place. */
const NO_KICKS: readonly Offset[] = [[0, 0]];

/** SRS with the guideline kicks for quarter turns and TETR.IO's SRS+ kicks for half turns (design §3). */
export const srs: RotationSystem = {
  cellOffsets(kind, rotation) {
    return SRS_OFFSETS[kind][rotation] as readonly Offset[];
  },

  kicks(kind, from, to) {
    if (kind === 'O') return NO_KICKS;
    return (kind === 'I' ? I_KICKS : JLSTZ_KICKS)[`${from}${to}`] ?? NO_KICKS;
  },
};
