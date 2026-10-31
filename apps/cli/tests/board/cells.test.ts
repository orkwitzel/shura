import { THEMES } from '@shura/client-core';
import { GARBAGE } from '@shura/engine';
import { describe, expect, it } from 'vitest';
import { paintRow } from '../../src/board/cells';
import { lookOf } from '../../src/board/look';

const { pieces, ghost, garbage, chrome } = THEMES.indigo;
const BLOCK = lookOf('none').skin.terminal;
const RESET = '\x1b[39m';
const rgb = ({ rgb }: { rgb: readonly number[] }) => `\x1b[38;2;${rgb.join(';')}m`;

describe('paintRow', () => {
  it('draws glyphs without colour, so every kind of cell reads differently', () => {
    expect(
      paintRow(
        [
          { fill: 'solid', kind: 'T' },
          { fill: 'solid', kind: GARBAGE },
          { fill: 'ghost', kind: 'T' },
          { fill: 'grey', kind: 'T' },
          { fill: 'empty' },
          { fill: 'blank' },
        ],
        lookOf('none'),
      ),
    ).toBe('[]##::[] .  ');
  });

  it('draws the skin in the theme’s colours, changing colour only where it has to', () => {
    expect(
      paintRow(
        [
          { fill: 'solid', kind: 'O' },
          { fill: 'solid', kind: 'O' },
          { fill: 'solid', kind: GARBAGE },
          { fill: 'ghost', kind: 'O' },
          { fill: 'grey', kind: 'O' },
          { fill: 'empty' },
        ],
        lookOf('truecolor'),
      ),
    ).toBe(
      `${rgb(pieces.O)}${BLOCK}${BLOCK}${rgb(garbage)}${BLOCK}${rgb(ghost)}░░` +
        `${rgb(chrome.grid)}${BLOCK} .${RESET}`,
    );
  });

  it('keeps the current colour through a blank, which is spaces', () => {
    expect(
      paintRow(
        [{ fill: 'solid', kind: 'O' }, { fill: 'blank' }, { fill: 'solid', kind: 'O' }],
        lookOf('ansi16'),
      ),
    ).toBe(`\x1b[93m${BLOCK}  ${BLOCK}${RESET}`);
  });

  it('leaves a row of blanks uncoloured, with no colour to set back', () => {
    expect(paintRow([{ fill: 'blank' }, { fill: 'blank' }], lookOf('truecolor'))).toBe('    ');
  });
});
