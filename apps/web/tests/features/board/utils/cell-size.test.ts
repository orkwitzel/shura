import { describe, expect, test } from 'vitest';
import { fitBoard } from '@/features/board/utils/cell-size';
import { LAYOUT_CELLS } from '@/features/board/utils/layout-board';

const RATIOS = [1, 1.25, 2];
const WINDOWS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1000, height: 1333 },
  { width: 777, height: 555 },
];

/** Whether `value` is a whole number, give or take floating-point error. */
const whole = (value: number) => Math.abs(value - Math.round(value)) < 1e-9;

describe('fitBoard', () => {
  for (const pixelRatio of RATIOS) {
    for (const window of WINDOWS) {
      const label = `${window.width}×${window.height} at pixel ratio ${pixelRatio}`;

      test(`${label}: the cell is a multiple of 8 physical pixels`, () => {
        const { cellSize, physicalCellSize } = fitBoard({ ...window, pixelRatio });
        expect(physicalCellSize % 8).toBe(0);
        expect(physicalCellSize).toBeGreaterThan(0);
        expect(cellSize * pixelRatio).toBeCloseTo(physicalCellSize, 9);
      });

      test(`${label}: the board, hold and preview fit the window`, () => {
        const { cellSize } = fitBoard({ ...window, pixelRatio });
        expect(LAYOUT_CELLS.height * cellSize).toBeLessThanOrEqual(window.height);
        expect(LAYOUT_CELLS.width * cellSize).toBeLessThanOrEqual(window.width);
      });

      test(`${label}: the cell is the largest that fits`, () => {
        const { physicalCellSize } = fitBoard({ ...window, pixelRatio });
        const bigger = (physicalCellSize + 8) / pixelRatio;
        const fits =
          LAYOUT_CELLS.height * bigger <= window.height &&
          LAYOUT_CELLS.width * bigger <= window.width;
        expect(fits).toBe(false);
      });

      test(`${label}: the board is centred, on whole physical pixels`, () => {
        const { cellSize, x, y } = fitBoard({ ...window, pixelRatio });
        expect(whole(x * pixelRatio)).toBe(true);
        expect(whole(y * pixelRatio)).toBe(true);
        const right = window.width - (x + LAYOUT_CELLS.width * cellSize);
        const bottom = window.height - (y + LAYOUT_CELLS.height * cellSize);
        expect(Math.abs(right - x)).toBeLessThanOrEqual(2 / pixelRatio);
        expect(Math.abs(bottom - y)).toBeLessThanOrEqual(2 / pixelRatio);
      });
    }
  }

  test('a 1080-pixel-high window at pixel ratio 1 gets 48-pixel cells', () => {
    // 22.5 cells high: 1080 / 22.5 = 48.
    expect(fitBoard({ width: 1920, height: 1080, pixelRatio: 1 }).physicalCellSize).toBe(48);
  });

  test('at pixel ratio 1.25, 768 CSS pixels (960 physical) get 40 physical pixels', () => {
    // 960 / 22.5 = 42.7, down to a multiple of 8: 40 physical pixels, 32 CSS pixels.
    const fit = fitBoard({ width: 1366, height: 768, pixelRatio: 1.25 });
    expect(fit.physicalCellSize).toBe(40);
    expect(fit.cellSize).toBe(32);
  });

  test('a window too small for 8-pixel cells still gets them', () => {
    expect(fitBoard({ width: 100, height: 100, pixelRatio: 1 }).physicalCellSize).toBe(8);
  });
});
