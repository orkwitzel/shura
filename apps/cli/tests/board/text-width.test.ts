import stringWidth from 'string-width';
import { describe, expect, it } from 'vitest';
import { centerIn, cutTo, padTo } from '../../src/board/text-width';

/** A Hebrew name with niqqud (combining marks), and a Japanese one (wide characters). */
const NIQQUD = 'שָׁלוֹם';
const WIDE = '日本語の名前';

describe('text in terminal columns (L1)', () => {
  it('pads by columns, not UTF-16 units: combining marks take none, wide characters two', () => {
    expect(stringWidth(padTo(NIQQUD, 8))).toBe(8);
    expect(stringWidth(padTo(WIDE, 14))).toBe(14);
    expect(padTo('Ada', 5)).toBe('Ada  ');
  });

  it('cuts to the columns without splitting a character, then pads what a wide one left', () => {
    expect(cutTo(WIDE, 5)).toBe('日本');
    expect(padTo(WIDE, 5)).toBe('日本 ');
    expect(cutTo('ééé', 2)).toBe('éé');
    expect(cutTo('Ada', 12)).toBe('Ada');
  });

  it('centres in the columns', () => {
    expect(centerIn('GO', 6)).toBe('  GO  ');
    expect(stringWidth(centerIn(WIDE, 20))).toBe(20);
    expect(centerIn(WIDE, 20).startsWith('    日')).toBe(true);
  });
});
