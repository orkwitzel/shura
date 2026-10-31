import type { ThemeColor } from '@shura/client-core';
import { GARBAGE } from '@shura/engine';
import { CELLS, type CellKind, GLYPHS, type Look } from './look';

/**
 * What a cell shows: a solid cell or a ghost of a kind, a greyed-out cell (a hold already used), an
 * empty cell of the board, or a blank (outside the board, or beside a small piece).
 */
export type Paint =
  | { readonly fill: 'solid' | 'ghost' | 'grey'; readonly kind: CellKind }
  | { readonly fill: 'empty' | 'blank' };

const RESET = '\x1b[39m';

/** The SGR sequence that sets the foreground to a theme colour, in the look's colour mode. */
function sgr({ colors }: Look, { rgb, ansi16 }: ThemeColor): string {
  if (colors === 'truecolor') return `\x1b[38;2;${rgb.join(';')}m`;
  return `\x1b[${ansi16 < 8 ? 30 + ansi16 : 90 + ansi16 - 8}m`;
}

/**
 * A cell's text and colour in `look`: the skin's characters in the theme's colours, or without
 * colour (`null`) a glyph that tells the kinds of cell apart.
 */
function cell(
  paint: Paint,
  { colors, theme, skin }: Look,
): { text: string; color: ThemeColor | null } {
  const plain = colors === 'none';
  switch (paint.fill) {
    case 'solid':
    case 'grey': {
      const garbage = paint.kind === GARBAGE;
      if (plain) return { text: garbage ? GLYPHS.garbage : GLYPHS.solid, color: null };
      if (paint.fill === 'grey') return { text: skin.terminal, color: theme.chrome.grid };
      return { text: skin.terminal, color: garbage ? theme.garbage : theme.pieces[paint.kind] };
    }
    case 'ghost':
      return plain
        ? { text: GLYPHS.ghost, color: null }
        : { text: CELLS.ghost, color: theme.ghost };
    // Empty cells and blanks read the same with colour as without (their glyphs are these too).
    case 'empty':
      return { text: CELLS.empty, color: plain ? null : theme.chrome.grid };
    case 'blank':
      return { text: CELLS.blank, color: null };
  }
}

/**
 * One pre-coloured string for a row of cells: the colour changes only where it has to, and the row
 * ends with the default colour back.
 */
export function paintRow(cells: readonly Paint[], look: Look): string {
  let out = '';
  let current: string | null = null;
  for (const paint of cells) {
    const { text, color } = cell(paint, look);
    // A blank is spaces, which look the same in any colour, so it keeps the current one.
    const code: string | null = color === null ? current : sgr(look, color);
    if (code !== current && code !== null) out += code;
    current = code;
    out += text;
  }
  return current === null ? out : out + RESET;
}
