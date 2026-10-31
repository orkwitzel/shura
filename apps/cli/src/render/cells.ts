import { ANSI16, CELLS, type CellKind, type ColorMode, FAINT, GLYPHS, RGB } from './palette';

/**
 * What a cell shows: a solid cell or a ghost of a kind, a greyed-out cell (a hold already used), an
 * empty cell of the board, or a blank (outside the board, or beside a small piece).
 */
export type Paint =
  | { readonly look: 'solid' | 'ghost' | 'grey'; readonly kind: CellKind }
  | { readonly look: 'empty' | 'blank' };

const RESET = '\x1b[39m';

function sgr(mode: ColorMode, kind: CellKind | 'faint'): string {
  if (kind === 'faint') {
    return mode === 'truecolor' ? `\x1b[38;2;${FAINT.rgb.join(';')}m` : `\x1b[${FAINT.ansi16}m`;
  }
  return mode === 'truecolor' ? `\x1b[38;2;${RGB[kind].join(';')}m` : `\x1b[${ANSI16[kind]}m`;
}

function glyph(paint: Paint): string {
  switch (paint.look) {
    case 'solid':
    case 'grey':
      return paint.kind === 'G' ? GLYPHS.garbage : GLYPHS.solid;
    case 'ghost':
      return GLYPHS.ghost;
    case 'empty':
      return GLYPHS.empty;
    case 'blank':
      return GLYPHS.blank;
  }
}

function colored(paint: Paint): { text: string; color: CellKind | 'faint' | null } {
  switch (paint.look) {
    case 'solid':
      return { text: CELLS.solid, color: paint.kind };
    case 'ghost':
      return { text: CELLS.ghost, color: paint.kind };
    case 'grey':
      return { text: CELLS.solid, color: 'faint' };
    case 'empty':
      return { text: CELLS.empty, color: 'faint' };
    case 'blank':
      return { text: CELLS.blank, color: null };
  }
}

/**
 * One pre-coloured string for a row of cells: the colour changes only where it has to, and the row
 * ends with the default colour back.
 */
export function paintRow(cells: readonly Paint[], mode: ColorMode): string {
  if (mode === 'none') return cells.map(glyph).join('');
  let out = '';
  let current: string | null = null;
  for (const cell of cells) {
    const { text, color } = colored(cell);
    // A blank is spaces, which look the same in any colour, so it keeps the current one.
    const code: string | null = color === null ? current : sgr(mode, color);
    if (code !== current && code !== null) out += code;
    current = code;
    out += text;
  }
  return current === null ? out : out + RESET;
}
