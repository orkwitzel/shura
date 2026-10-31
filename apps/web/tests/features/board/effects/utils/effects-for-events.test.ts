import type { Effects } from '@shura/client-core';
import { type LockEvent, TSpin } from '@shura/engine';
import { describe, expect, test } from 'vitest';
import { type Effect, effectsForEvents } from '@/features/board/effects/utils/effects-for-events';
import { clearedRow, hardDropEvent, lockEvent } from '../../../../support/engine-events';

/** The back-to-back status before each lock: off. */
const noBackToBack = () => false;

/** The particles per cell of the bursts among `effects`. */
const bursts = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.type === 'burst' ? [effect.particles] : []));

describe('effectsForEvents', () => {
  test('a line clear bursts, bigger for more lines', () => {
    const sizes = ([1, 2, 3, 4] as const).map((lines) => {
      const [size] = bursts(effectsForEvents([lockEvent({ lines })], 'full', noBackToBack));
      return size ?? 0;
    });
    expect(sizes[0]).toBeGreaterThan(0);
    for (let at = 1; at < sizes.length; at++) {
      expect(sizes[at]).toBeGreaterThan(sizes[at - 1] ?? 0);
    }
  });

  test('bursts grow with the combo, up to combo 10', () => {
    const size = (combo: number) =>
      bursts(effectsForEvents([lockEvent({ lines: 1, combo })], 'full', noBackToBack))[0] ?? 0;
    expect(size(1)).toBeGreaterThan(size(0));
    expect(size(5)).toBeGreaterThan(size(1));
    expect(size(10)).toBeGreaterThan(size(5));
    expect(size(20)).toBe(size(10));
  });

  test('T-spins, back-to-backs and perfect clears burst bigger', () => {
    const size = (lock: LockEvent, backToBackBefore = false) =>
      bursts(effectsForEvents([lock], 'full', () => backToBackBefore))[0] ?? 0;
    const double = size(lockEvent({ lines: 2 }));
    expect(size(lockEvent({ lines: 2, tSpin: TSpin.Full }))).toBeGreaterThan(double);
    expect(size(lockEvent({ lines: 2, perfectClear: true }))).toBeGreaterThan(double);
    // A Tetris is a back-to-back only when the status was on before it.
    const tetris = size(lockEvent({ lines: 4, backToBack: true }));
    expect(size(lockEvent({ lines: 4, backToBack: true }), true)).toBeGreaterThan(tetris);
  });

  test.each<Effects>(['full', 'reduced', 'off'])(
    'under %s, the status before each lock is asked for once, in order',
    (setting) => {
      const first = lockEvent({ lines: 4, backToBack: true, frame: 10 });
      const second = lockEvent({ lines: 1, frame: 20 });
      const asked: LockEvent[] = [];
      effectsForEvents([first, hardDropEvent(3), second], setting, (lock) => {
        asked.push(lock);
        return false;
      });
      expect(asked).toEqual([first, second]);
    },
  );

  test('a T-spin that clears nothing bursts from the piece', () => {
    const piece = { kind: 'T' as const, cells: [{ col: 4, row: 0 }] };
    const effects = effectsForEvents(
      [lockEvent({ tSpin: TSpin.Full, piece })],
      'full',
      noBackToBack,
    );
    expect(effects).toContainEqual(
      expect.objectContaining({ type: 'burst', cells: [{ col: 4, row: 0, kind: 'T' }] }),
    );
    expect(bursts(effectsForEvents([lockEvent({ piece })], 'full', noBackToBack))).toEqual([]);
  });

  test('a burst comes from the cleared cells, in their kinds', () => {
    const rows = [clearedRow(0, ['G', 'I', null, 'T', 'T', 'T', 'O', 'O', 'L', 'L'])];
    const burst = effectsForEvents(
      [lockEvent({ lines: 1, clearedRows: rows })],
      'full',
      noBackToBack,
    ).find((effect) => effect.type === 'burst');
    const cells = burst?.type === 'burst' ? burst.cells : [];
    expect(cells).toHaveLength(9);
    expect(cells[0]).toEqual({ col: 0, row: 0, kind: 'G' });
    expect(cells[2]).toEqual({ col: 3, row: 0, kind: 'T' });
  });

  test('clears of 2 or more lines shake the board, harder for more lines', () => {
    const shake = (lines: 1 | 2 | 3 | 4) =>
      effectsForEvents([lockEvent({ lines })], 'full', noBackToBack).find(
        (effect) => effect.type === 'shake',
      );
    expect(shake(1)).toBeUndefined();
    const strengths = ([2, 3, 4] as const).map((lines) => {
      const effect = shake(lines);
      return effect?.type === 'shake' ? effect.strength : 0;
    });
    expect(strengths[0]).toBeGreaterThan(0);
    expect(strengths[1]).toBeGreaterThan(strengths[0] ?? 0);
    expect(strengths[2]).toBeGreaterThan(strengths[1] ?? 0);
  });

  test('a hard drop leaves a trail down to where the piece locked, and nudges the board down', () => {
    const piece = { kind: 'I' as const, cells: [3, 4, 5, 6].map((col) => ({ col, row: 0 })) };
    const effects = effectsForEvents(
      [hardDropEvent(15), lockEvent({ piece })],
      'full',
      noBackToBack,
    );
    expect(effects).toContainEqual(
      expect.objectContaining({ type: 'trail', kind: 'I', cells: piece.cells, rows: 15 }),
    );
    const nudge = effects.find((effect) => effect.type === 'nudge');
    expect(nudge?.type === 'nudge' && nudge.distance).toBeGreaterThanOrEqual(2);
    expect(nudge?.type === 'nudge' && nudge.distance).toBeLessThanOrEqual(3);
  });

  test('a hard drop that drops no rows leaves no trail', () => {
    const piece = { kind: 'I' as const, cells: [{ col: 3, row: 0 }] };
    const effects = effectsForEvents(
      [hardDropEvent(0), lockEvent({ piece })],
      'full',
      noBackToBack,
    );
    expect(effects.some((effect) => effect.type === 'trail')).toBe(false);
  });

  test('a line clear flashes the cleared rows', () => {
    const rows = [clearedRow(0), clearedRow(3)];
    const effects = effectsForEvents(
      [lockEvent({ lines: 2, clearedRows: rows })],
      'full',
      noBackToBack,
    );
    expect(effects).toContainEqual({ type: 'flash', rows: [0, 3], delay: 0 });
  });

  test('a lock brightens the locked cells, where they are once the rows below have cleared', () => {
    const piece = {
      kind: 'L' as const,
      cells: [
        { col: 0, row: 1 },
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 2, row: 2 },
      ],
    };
    // Row 1 clears: the L's cells in it go, and the one above falls a row.
    const lock = lockEvent({ lines: 1, piece, clearedRows: [clearedRow(1)] });
    expect(effectsForEvents([lock], 'full', noBackToBack)).toContainEqual({
      type: 'glow',
      kind: 'L',
      cells: [{ col: 2, row: 1 }],
      delay: 0,
    });
  });

  test('a level-up pulses the border, and a top-out fades the stack', () => {
    const effects = effectsForEvents(
      [
        { type: 'levelUp', frame: 100, level: 2 },
        { type: 'topOut', frame: 100 },
      ],
      'full',
      noBackToBack,
    );
    expect(effects).toEqual([
      { type: 'pulse', delay: 0 },
      { type: 'fade', delay: 0 },
    ]);
  });

  test('effects of later frames among those given together wait for their frame', () => {
    const effects = effectsForEvents(
      [lockEvent({ lines: 1, frame: 10 }), lockEvent({ lines: 1, frame: 16 })],
      'full',
      noBackToBack,
    );
    const flashes = effects.filter((effect) => effect.type === 'flash');
    // 6 frames at 60 per second: 100 ms.
    expect(flashes.map((flash) => flash.delay)).toEqual([0, 100]);
  });

  describe('the Effects setting', () => {
    /** A frame with a bit of everything: a hard-dropped Tetris that levels up, then a top-out. */
    const everything = [
      hardDropEvent(12),
      lockEvent({
        lines: 4,
        piece: { kind: 'I', cells: [0, 1, 2, 3].map((row) => ({ col: 9, row })) },
      }),
      { type: 'levelUp', frame: 100, level: 2 },
      { type: 'topOut', frame: 100 },
    ] as const;
    const typesUnder = (setting: Effects) =>
      new Set(effectsForEvents(everything, setting, noBackToBack).map((effect) => effect.type));

    test('Full shows everything', () => {
      expect(typesUnder('full')).toEqual(
        new Set(['burst', 'flash', 'shake', 'trail', 'nudge', 'pulse', 'fade']),
      );
    });

    test('Reduced has no shake, nudge or trails', () => {
      expect(typesUnder('reduced')).toEqual(new Set(['burst', 'flash', 'pulse', 'fade']));
    });

    test('Off shows none', () => {
      expect(typesUnder('off')).toEqual(new Set());
    });

    test('a lock that brightens cells brightens them under Reduced too', () => {
      const piece = { kind: 'O' as const, cells: [{ col: 0, row: 0 }] };
      const types = effectsForEvents([lockEvent({ piece })], 'reduced', noBackToBack).map(
        (effect) => effect.type,
      );
      expect(types).toEqual(['glow']);
    });
  });
});
