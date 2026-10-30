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
  /** The cells of `kind` in `rotation`, as offsets from the top-left cell of the piece's box. */
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

/** The rotation states as the guideline names them, indexed by `Rotation`. */
const STATE_NAMES = ['0', 'R', '2', 'L'] as const;

type StateName = (typeof STATE_NAMES)[number];

/** A turn from one rotation state to another, written from-state then to-state. */
type Transition = Exclude<`${StateName}${StateName}`, '00' | 'RR' | '22' | 'LL'>;

/** The kicks each turn tries, as (columns right, rows up), with the turn in place first. */
type KickTable = Readonly<Record<Transition, readonly Offset[]>>;

/**
 * The guideline SRS kicks for J, L, S, T and Z, then TETR.IO's SRS+ 180 kicks for them. The tests
 * cite the sources.
 */
// biome-ignore format: one turn per line, as the sources print them
const JLSTZ_KICKS: KickTable = {
  '0R': [[ 0,  0], [-1,  0], [-1,  1], [ 0, -2], [-1, -2]],
  'R0': [[ 0,  0], [ 1,  0], [ 1, -1], [ 0,  2], [ 1,  2]],
  'R2': [[ 0,  0], [ 1,  0], [ 1, -1], [ 0,  2], [ 1,  2]],
  '2R': [[ 0,  0], [-1,  0], [-1,  1], [ 0, -2], [-1, -2]],
  '2L': [[ 0,  0], [ 1,  0], [ 1,  1], [ 0, -2], [ 1, -2]],
  'L2': [[ 0,  0], [-1,  0], [-1, -1], [ 0,  2], [-1,  2]],
  'L0': [[ 0,  0], [-1,  0], [-1, -1], [ 0,  2], [-1,  2]],
  '0L': [[ 0,  0], [ 1,  0], [ 1,  1], [ 0, -2], [ 1, -2]],

  '02': [[ 0,  0], [ 0,  1], [ 1,  1], [-1,  1], [ 1,  0], [-1,  0]],
  'RL': [[ 0,  0], [ 1,  0], [ 1,  2], [ 1,  1], [ 0,  2], [ 0,  1]],
  '20': [[ 0,  0], [ 0, -1], [-1, -1], [ 1, -1], [-1,  0], [ 1,  0]],
  'LR': [[ 0,  0], [-1,  0], [-1,  2], [-1,  1], [ 0,  2], [ 0,  1]],
};

/** The guideline SRS kicks for I, then TETR.IO's SRS+ 180 kicks for I. */
// biome-ignore format: one turn per line, as the sources print them
const I_KICKS: KickTable = {
  '0R': [[ 0,  0], [-2,  0], [ 1,  0], [-2, -1], [ 1,  2]],
  'R0': [[ 0,  0], [ 2,  0], [-1,  0], [ 2,  1], [-1, -2]],
  'R2': [[ 0,  0], [-1,  0], [ 2,  0], [-1,  2], [ 2, -1]],
  '2R': [[ 0,  0], [ 1,  0], [-2,  0], [ 1, -2], [-2,  1]],
  '2L': [[ 0,  0], [ 2,  0], [-1,  0], [ 2,  1], [-1, -2]],
  'L2': [[ 0,  0], [-2,  0], [ 1,  0], [-2, -1], [ 1,  2]],
  'L0': [[ 0,  0], [ 1,  0], [-2,  0], [ 1, -2], [-2,  1]],
  '0L': [[ 0,  0], [-1,  0], [ 2,  0], [-1,  2], [ 2, -1]],

  '02': [[ 0,  0], [ 0,  1]],
  'RL': [[ 0,  0], [ 1,  0]],
  '20': [[ 0,  0], [ 0, -1]],
  'LR': [[ 0,  0], [-1,  0]],
};

const IN_PLACE: readonly Offset[] = [[0, 0]];

/** O turns only in place. */
// biome-ignore format: a grid of turns
const O_KICKS: KickTable = {
  '0R': IN_PLACE, 'R0': IN_PLACE, 'R2': IN_PLACE, '2R': IN_PLACE,
  '2L': IN_PLACE, 'L2': IN_PLACE, 'L0': IN_PLACE, '0L': IN_PLACE,
  '02': IN_PLACE, 'RL': IN_PLACE, '20': IN_PLACE, 'LR': IN_PLACE,
};

interface SrsPiece {
  /** The piece's cells in each rotation state, indexed by `Rotation`. */
  cells: readonly [readonly Offset[], readonly Offset[], readonly Offset[], readonly Offset[]];
  kicks: KickTable;
}

/**
 * A piece from a picture of its box in rotation state 0, top row first, `.` for an empty cell. Each
 * turn clockwise rotates the box a quarter turn about its centre, which takes the cell `x` columns
 * right of the top-left cell and `y` rows above it to column `width − 1 + y`, row `−x`.
 */
function srsPiece(box: readonly string[], kicks: KickTable): SrsPiece {
  const spawn = box.flatMap((line, down) =>
    [...line].flatMap((cell, x): Offset[] => (cell === '.' ? [] : [[x, -down]])),
  );
  const turn = (cells: readonly Offset[]) =>
    cells.map(([x, y]): Offset => [box.length - 1 + y, -x]);
  const right = turn(spawn);
  const two = turn(right);
  return { cells: [spawn, right, two, turn(two)], kicks };
}

/**
 * Every piece's box in rotation state 0, as SRS draws it: flat side down, I in a 4 × 4 box, O in a
 * 2 × 2 box so turning never changes its cells, and the rest in a 3 × 3 box.
 */
// biome-ignore format: the pictures
const SRS_PIECES: Record<PieceKind, SrsPiece> = {
  I: srsPiece(['....',
               'IIII',
               '....',
               '....'], I_KICKS),

  O: srsPiece(['OO',
               'OO'], O_KICKS),

  T: srsPiece(['.T.',
               'TTT',
               '...'], JLSTZ_KICKS),

  S: srsPiece(['.SS',
               'SS.',
               '...'], JLSTZ_KICKS),

  Z: srsPiece(['ZZ.',
               '.ZZ',
               '...'], JLSTZ_KICKS),

  J: srsPiece(['J..',
               'JJJ',
               '...'], JLSTZ_KICKS),

  L: srsPiece(['..L',
               'LLL',
               '...'], JLSTZ_KICKS),
};

/** SRS with the guideline kicks for quarter turns and TETR.IO's SRS+ kicks for half turns (design §3). */
export const srs: RotationSystem = {
  cellOffsets(kind, rotation) {
    return SRS_PIECES[kind].cells[rotation];
  },

  kicks(kind, from, to) {
    if (from === to)
      throw new RangeError(`a turn must change the rotation state, got ${from} to ${to}`);
    return SRS_PIECES[kind].kicks[`${STATE_NAMES[from]}${STATE_NAMES[to]}` as Transition];
  },
};
