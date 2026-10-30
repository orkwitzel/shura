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
   * the turn in place. Throws a RangeError if `from` and `to` are the same state.
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

/** A piece's cell offsets in each rotation state, indexed by `Rotation`. */
type CellOffsets = readonly [
  readonly Offset[],
  readonly Offset[],
  readonly Offset[],
  readonly Offset[],
];

function srsOffsets(kind: PieceKind): CellOffsets {
  const spawn = SPAWN_OFFSETS[kind];
  const right = turnedOffsets(kind, spawn);
  const two = turnedOffsets(kind, right);
  return [spawn, right, two, turnedOffsets(kind, two)];
}

const SRS_OFFSETS: Record<PieceKind, CellOffsets> = {
  I: srsOffsets('I'),
  O: srsOffsets('O'),
  T: srsOffsets('T'),
  S: srsOffsets('S'),
  Z: srsOffsets('Z'),
  J: srsOffsets('J'),
  L: srsOffsets('L'),
};

/** A turn from one rotation state to another, written from-state then to-state. */
type Transition = Exclude<`${Rotation}${Rotation}`, '00' | '11' | '22' | '33'>;

type KickTable = Readonly<Record<Transition, readonly Offset[]>>;

/**
 * The guideline SRS kicks for J, L, S, T and Z, then TETR.IO's SRS+ 180 kicks for them. The tests
 * cite the sources.
 */
// biome-ignore format: one turn per line, as the sources print them
const JLSTZ_KICKS: KickTable = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '02': [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
  '13': [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]],
  '20': [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
  '31': [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]],
};

/** The guideline SRS kicks for I, then TETR.IO's SRS+ 180 kicks for I. */
// biome-ignore format: one turn per line, as the sources print them
const I_KICKS: KickTable = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '02': [[0, 0], [0, 1]],
  '13': [[0, 0], [1, 0]],
  '20': [[0, 0], [0, -1]],
  '31': [[0, 0], [-1, 0]],
};

/** O turns only in place. */
const NO_KICKS: readonly Offset[] = [[0, 0]];

/** SRS with the guideline kicks for quarter turns and TETR.IO's SRS+ kicks for half turns (design §3). */
export const srs: RotationSystem = {
  cellOffsets(kind, rotation) {
    return SRS_OFFSETS[kind][rotation];
  },

  kicks(kind, from, to) {
    if (from === to)
      throw new RangeError(`a turn must change the rotation state, got ${from} to ${to}`);
    if (kind === 'O') return NO_KICKS;
    return (kind === 'I' ? I_KICKS : JLSTZ_KICKS)[`${from}${to}` as Transition];
  },
};
