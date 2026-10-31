import { describe, expect, it } from 'vitest';
import { menuLines, overlayRows } from '../../src/board/overlay';

/** A board as `boardRows` draws it without colour: 2 hidden rows, 20 visible, the floor. */
const ROWS = [
  ...Array.from({ length: 2 }, () => ` ${'  '.repeat(10)} `),
  ...Array.from({ length: 20 }, () => `│${' .'.repeat(10)}│`),
  `└${'─'.repeat(20)}┘`,
];

/** A board row with `inside` between the walls. */
const row = (inside: string) => `│${inside}│`;

describe('overlayRows', () => {
  it('leaves the board as it is with no lines', () => {
    expect(overlayRows(ROWS, [])).toEqual(ROWS);
  });

  it('draws the lines as a block centred on the visible board, each over a whole row', () => {
    const rows = overlayRows(ROWS, ['', 'GO', '']);
    // The visible rows are 2–21: three lines start 8 rows down.
    expect(rows.slice(10, 13)).toEqual([
      row(' '.repeat(20)),
      row(`${' '.repeat(9)}GO${' '.repeat(9)}`),
      row(' '.repeat(20)),
    ]);
    expect(rows.slice(0, 10)).toEqual(ROWS.slice(0, 10));
    expect(rows.slice(13)).toEqual(ROWS.slice(13));
  });

  it('left-aligns the lines with each other', () => {
    const rows = overlayRows(ROWS, ['AB', 'ABCD']);
    expect(rows.slice(11, 13)).toEqual([
      row(`${' '.repeat(8)}AB${' '.repeat(10)}`),
      row(`${' '.repeat(8)}ABCD${' '.repeat(8)}`),
    ]);
  });

  it('cuts lines longer than the board', () => {
    expect(overlayRows(ROWS, ['X'.repeat(25)])[11]).toBe(row('X'.repeat(20)));
  });
});

describe('menuLines', () => {
  it('puts each entry’s keys at the right of 18 columns, under the title, with blank lines around', () => {
    expect(
      menuLines('PAUSED', [
        { hint: 'Esc, Enter', label: 'Resume' },
        { hint: 'Q', label: 'Quit to menu' },
      ]),
    ).toEqual(['', 'PAUSED', '', 'Resume  Esc, Enter', 'Quit to menu     Q', '']);
  });
});
