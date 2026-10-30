import { describe, expect, test } from 'vitest';
import { applyMarginTime, type ClearHistory, calculateAttack, TSpin } from '../src/index';

// Every expected value is a row of the attack table in docs/design.md §3.

/** The history before a lock that follows a lock that cleared nothing, with no back-to-back. */
const FRESH: ClearHistory = { combo: -1, backToBack: false };
/** The history after a difficult clear, which makes the next difficult clear back-to-back. */
const AFTER_DIFFICULT: ClearHistory = { combo: -1, backToBack: true };

function attackOf(
  lines: 0 | 1 | 2 | 3 | 4,
  tSpin = TSpin.None,
  history = FRESH,
  perfectClear = false,
) {
  return calculateAttack(history, { lines, tSpin, perfectClear });
}

describe('the attack calculator', () => {
  test.each([
    { name: 'a lock that clears nothing', lines: 0, attack: 0 },
    { name: 'a single', lines: 1, attack: 0 },
    { name: 'a double', lines: 2, attack: 1 },
    { name: 'a triple', lines: 3, attack: 2 },
    { name: 'a Tetris', lines: 4, attack: 4 },
  ] as const)('$name sends $attack', ({ lines, attack }) => {
    expect(attackOf(lines)).toBe(attack);
  });

  test.each([
    { name: 'a T-spin mini zero', tSpin: TSpin.Mini, lines: 0, attack: 0 },
    { name: 'a T-spin mini single', tSpin: TSpin.Mini, lines: 1, attack: 0 },
    { name: 'a T-spin mini double', tSpin: TSpin.Mini, lines: 2, attack: 1 },
    { name: 'a T-spin zero', tSpin: TSpin.Full, lines: 0, attack: 0 },
    { name: 'a T-spin single', tSpin: TSpin.Full, lines: 1, attack: 2 },
    { name: 'a T-spin double', tSpin: TSpin.Full, lines: 2, attack: 4 },
    { name: 'a T-spin triple', tSpin: TSpin.Full, lines: 3, attack: 6 },
  ] as const)('$name sends $attack', ({ tSpin, lines, attack }) => {
    expect(attackOf(lines, tSpin)).toBe(attack);
  });

  describe('back-to-back', () => {
    test.each([
      { name: 'Tetris', lines: 4, tSpin: TSpin.None, attack: 5 },
      { name: 'T-spin mini single', lines: 1, tSpin: TSpin.Mini, attack: 1 },
      { name: 'T-spin mini double', lines: 2, tSpin: TSpin.Mini, attack: 2 },
      { name: 'T-spin double', lines: 2, tSpin: TSpin.Full, attack: 5 },
      { name: 'T-spin triple', lines: 3, tSpin: TSpin.Full, attack: 7 },
    ] as const)('a back-to-back $name sends one more, $attack', ({ lines, tSpin, attack }) => {
      expect(attackOf(lines, tSpin, AFTER_DIFFICULT)).toBe(attack);
    });

    test.each([1, 2, 3] as const)(
      'a %i-line clear after a difficult clear gets no bonus',
      (lines) => {
        expect(attackOf(lines, TSpin.None, AFTER_DIFFICULT)).toBe(attackOf(lines));
      },
    );

    test('a T-spin zero after a difficult clear sends nothing', () => {
      expect(attackOf(0, TSpin.Full, AFTER_DIFFICULT)).toBe(0);
    });
  });

  describe('combos', () => {
    // The combo counter after the clear: 0 for the first clear in a row, and the bonus by it.
    const BONUSES = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

    test.each(BONUSES.map((bonus, combo) => ({ combo, bonus })))(
      'combo $combo adds $bonus to a single',
      ({ combo, bonus }) => {
        expect(attackOf(1, TSpin.None, { combo: combo - 1, backToBack: false })).toBe(bonus);
      },
    );

    test.each([12, 13, 20, 50])('combo %i and beyond adds 5', (combo) => {
      expect(attackOf(1, TSpin.None, { combo: combo - 1, backToBack: false })).toBe(5);
    });

    test('the bonus adds to the clear and back-to-back: combo 4 back-to-back Tetris sends 4 + 1 + 1', () => {
      expect(attackOf(4, TSpin.None, { combo: 3, backToBack: true })).toBe(6);
    });

    test('a lock that clears nothing sends no combo bonus', () => {
      expect(attackOf(0, TSpin.None, { combo: 8, backToBack: true })).toBe(0);
    });
  });

  describe('perfect clears', () => {
    test.each([
      { name: 'single', lines: 1, attack: 10 },
      { name: 'double', lines: 2, attack: 11 },
      { name: 'Tetris', lines: 4, attack: 14 },
    ] as const)('a perfect clear $name adds 10, sending $attack', ({ lines, attack }) => {
      expect(attackOf(lines, TSpin.None, FRESH, true)).toBe(attack);
    });

    test('a back-to-back perfect clear Tetris at combo 2 sends 4 + 1 + 1 + 10', () => {
      expect(attackOf(4, TSpin.None, { combo: 1, backToBack: true }, true)).toBe(16);
    });
  });
});

describe('margin time', () => {
  // design §3: from 120 s (frame 7,200), ×0.25 more every 30 s (1,800 frames): 1.25, 1.5, …
  const VERSUS_MARGIN = { start: 7_200, interval: 1_800 };

  test.each([
    { frame: 1, multiplied: 8 },
    { frame: 7_199, multiplied: 8 },
    { frame: 7_200, multiplied: 10 },
    { frame: 8_999, multiplied: 10 },
    { frame: 9_000, multiplied: 12 },
    { frame: 10_800, multiplied: 14 },
    { frame: 14_400, multiplied: 18 },
  ])('an 8-line attack at frame $frame sends $multiplied', ({ frame, multiplied }) => {
    expect(applyMarginTime(8, frame, VERSUS_MARGIN, 0)).toEqual({ lines: multiplied, carry: 0 });
  });

  test('sends whole lines and carries the fraction left, in quarter-lines', () => {
    expect(applyMarginTime(1, 7_200, VERSUS_MARGIN, 0)).toEqual({ lines: 1, carry: 1 });
    expect(applyMarginTime(5, 7_200, VERSUS_MARGIN, 0)).toEqual({ lines: 6, carry: 1 });
    expect(applyMarginTime(2, 9_000, VERSUS_MARGIN, 0)).toEqual({ lines: 3, carry: 0 });
    expect(applyMarginTime(1, 10_800, VERSUS_MARGIN, 0)).toEqual({ lines: 1, carry: 3 });
  });

  test('adds the carry to the next attack, so four 1-line attacks at ×1.25 send 5 lines', () => {
    let carry = 0;
    const sent = [1, 1, 1, 1].map((attack) => {
      const multiplied = applyMarginTime(attack, 7_200, VERSUS_MARGIN, carry);
      carry = multiplied.carry;
      return multiplied.lines;
    });
    expect(sent).toEqual([1, 1, 1, 2]);
    expect(carry).toBe(0);
  });

  test('keeps the carry through a lock that sends nothing', () => {
    expect(applyMarginTime(0, 9_000, VERSUS_MARGIN, 3)).toEqual({ lines: 0, carry: 3 });
  });

  test('leaves an attack before margin time as it is', () => {
    expect(applyMarginTime(1, 7_199, VERSUS_MARGIN, 0)).toEqual({ lines: 1, carry: 0 });
  });
});
