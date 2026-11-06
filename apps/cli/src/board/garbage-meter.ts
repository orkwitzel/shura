import type { ThemeColor } from '@shura/client-core';
import type { Look } from './look';

/** The meter's character: a right half block, so it sits against the well's left wall. */
export const METER = '▐';

function sgr({ colors }: Look, { rgb, ansi16 }: ThemeColor): string {
  if (colors === 'truecolor') return `\x1b[38;2;${rgb.join(';')}m`;
  return `\x1b[${ansi16 < 8 ? 30 + ansi16 : 90 + ansi16 - 8}m`;
}

/**
 * The garbage meter as a column of `▐` for the left of a well (design §13.3), `height` characters
 * top first, filled from the bottom in the theme's garbage colour: a character for every
 * `linesPer` lines waiting (2 on a half-block board), one more for a part, never past the top.
 */
export function meterColumn(lines: number, height: number, linesPer: number, look: Look): string[] {
  const filled = Math.min(height, Math.ceil(lines / linesPer));
  const bar = look.colors === 'none' ? METER : `${sgr(look, look.theme.garbage)}${METER}\x1b[39m`;
  return Array.from({ length: height }, (_, row) => (height - row <= filled ? bar : ' '));
}
