import { type PieceKind, srs } from '@shura/engine';
import { type Paint, paintRow } from './cells';
import type { ColorMode } from './palette';

/** A small piece's box: 4 cells (8 characters) wide, 2 rows tall, enough for any piece flat. */
const BOX_CELLS = 4;

/**
 * A piece in its spawn orientation, for hold and the preview: two pre-coloured rows, each 8
 * characters wide, the piece centred. `grey` draws it greyed out, as a hold already used.
 */
export function pieceRows(
  kind: PieceKind,
  colors: ColorMode,
  grey = false,
): [top: string, bottom: string] {
  const offsets = srs.cellOffsets(kind, 0);
  const cols = offsets.map(([col]) => col);
  const rows = offsets.map(([, row]) => row);
  const left = Math.min(...cols);
  const width = Math.max(...cols) - left + 1;
  const topRow = Math.max(...rows);
  const look = grey ? 'grey' : 'solid';
  const paint = (rowFromTop: number): string => {
    const cells: Paint[] = Array.from({ length: width }, () => ({ look: 'blank' }));
    for (const [col, row] of offsets) {
      if (topRow - row === rowFromTop) cells[col - left] = { look, kind };
    }
    // Centre in characters: a 3-cell piece sits half a cell in.
    const pad = BOX_CELLS * 2 - width * 2;
    const before = ' '.repeat(Math.floor(pad / 2));
    const after = ' '.repeat(Math.ceil(pad / 2));
    return `${before}${paintRow(cells, colors)}${after}`;
  };
  return [paint(0), paint(1)];
}

/** An empty small-piece box. */
export const NO_PIECE: [string, string] = [' '.repeat(BOX_CELLS * 2), ' '.repeat(BOX_CELLS * 2)];
