import { describe, expect, test } from 'vitest';
import type { Viewport } from '@/features/board/utils/cell-size';
import {
  layoutOpponents,
  MATCH_CELLS,
  type MatchLayout,
} from '@/features/board/utils/layout-opponents';

const W1600 = { width: 1600, height: 900, pixelRatio: 1 };
const W1280 = { width: 1280, height: 720, pixelRatio: 1 };

/** Every box a layout places, in CSS pixels: your board's, then each opponent's. */
function boxes({ own, opponents }: MatchLayout) {
  const sized = (kind: 'own' | 'full' | 'small', cellSize: number) => ({
    width: MATCH_CELLS[kind].width * cellSize,
    height: MATCH_CELLS[kind].height * cellSize,
  });
  return [
    ...(own ? [{ x: own.x, y: own.y, ...sized('own', own.cellSize) }] : []),
    ...opponents.spots.map(({ x, y }) => ({ x, y, ...sized(opponents.kind, opponents.cellSize) })),
  ];
}

/** The checks every layout passes: whole art pixels, at least 8, inside the window, no overlap. */
function expectSound(viewport: Viewport, layout: MatchLayout) {
  const { own, opponents } = layout;
  for (const { cellSize, physicalCellSize } of own ? [own, opponents] : [opponents]) {
    expect(physicalCellSize % 8).toBe(0);
    expect(physicalCellSize).toBeGreaterThanOrEqual(8);
    expect(cellSize * viewport.pixelRatio).toBeCloseTo(physicalCellSize, 9);
  }
  const placed = boxes(layout);
  for (const box of placed) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    // Each on a whole physical pixel.
    expect(Number.isInteger(box.x * viewport.pixelRatio)).toBe(true);
    expect(Number.isInteger(box.y * viewport.pixelRatio)).toBe(true);
  }
  placed.forEach((a, i) => {
    for (const b of placed.slice(i + 1)) {
      const apart =
        a.x + a.width <= b.x ||
        b.x + b.width <= a.x ||
        a.y + a.height <= b.y ||
        b.y + b.height <= a.y;
      expect(apart).toBe(true);
    }
  });
}

describe('layoutOpponents: a 1v1 (design §13.2, Match)', () => {
  test('gives the opponent your cell size when the window fits both full boards', () => {
    const layout = layoutOpponents(W1600, 1);
    expectSound(W1600, layout);
    expect(layout.own?.cellSize).toBe(32);
    expect(layout.opponents).toMatchObject({ kind: 'full', cellSize: 32, columns: 1, rows: 1 });
    expect(layout.opponents.spots).toHaveLength(1);
  });

  test('in 1280×720, both at 24 px', () => {
    const layout = layoutOpponents(W1280, 1);
    expectSound(W1280, layout);
    expect(layout.own?.cellSize).toBe(24);
    expect(layout.opponents.cellSize).toBe(24);
  });

  test('shrinks the opponent, to the largest multiple of 8 that fits, when both don’t fit', () => {
    const narrow = { width: 1000, height: 900, pixelRatio: 1 };
    const layout = layoutOpponents(narrow, 1);
    expectSound(narrow, layout);
    expect(layout.own?.cellSize).toBe(32);
    expect(layout.opponents.cellSize).toBe(8);
  });

  test('counts multiples of 8 in physical pixels', () => {
    const retina = { ...W1280, pixelRatio: 2 };
    const layout = layoutOpponents(retina, 1);
    expectSound(retina, layout);
    // 1440 physical pixels high: 56-pixel cells for you; 48 for the opponent in what's left.
    expect(layout.own?.physicalCellSize).toBe(56);
    expect(layout.opponents.physicalCellSize).toBe(48);
    expect(layout.opponents.cellSize).toBe(24);
  });
});

describe('layoutOpponents: an FFA', () => {
  const cases = [
    // 7 in 1600×900: the design's 4×2 grid at 16 px.
    { viewport: W1600, count: 7, own: 32, cell: 16, columns: 4, rows: 2 },
    { viewport: W1600, count: 4, own: 32, cell: 16, columns: 4, rows: 1 },
    { viewport: W1600, count: 3, own: 32, cell: 16, columns: 3, rows: 1 },
    { viewport: W1280, count: 3, own: 24, cell: 16, columns: 3, rows: 1 },
    { viewport: W1280, count: 4, own: 24, cell: 8, columns: 4, rows: 1 },
    { viewport: W1280, count: 7, own: 24, cell: 8, columns: 7, rows: 1 },
  ];
  for (const { viewport, count, own, cell, columns, rows } of cases) {
    test(`${count} opponents in ${viewport.width}×${viewport.height}: ${columns}×${rows} small boards at ${cell} px`, () => {
      const layout = layoutOpponents(viewport, count);
      expectSound(viewport, layout);
      expect(layout.own?.cellSize).toBe(own);
      expect(layout.opponents).toMatchObject({ kind: 'small', cellSize: cell, columns, rows });
      expect(layout.opponents.spots).toHaveLength(count);
    });
  }

  test('picks the column count that gives the largest boards', () => {
    for (const viewport of [W1600, W1280, { width: 1920, height: 1080, pixelRatio: 1.25 }]) {
      for (const count of [2, 3, 4, 5, 6, 7]) {
        const { own, opponents } = layoutOpponents(viewport, count);
        const room =
          viewport.width * viewport.pixelRatio -
          (MATCH_CELLS.own.width + 1) * (own?.physicalCellSize ?? 0);
        for (let columns = 1; columns <= count; columns++) {
          const rows = Math.ceil(count / columns);
          const fits = Math.min(
            room / (columns * MATCH_CELLS.small.width),
            (viewport.height * viewport.pixelRatio) / (rows * MATCH_CELLS.small.height),
          );
          expect(Math.max(Math.floor(fits / 8) * 8, 8)).toBeLessThanOrEqual(
            opponents.physicalCellSize,
          );
        }
      }
    }
  });

  test('never goes below 8 px a cell, however small the window', () => {
    const tiny = { width: 400, height: 300, pixelRatio: 1 };
    const layout = layoutOpponents(tiny, 7);
    expect(layout.own?.cellSize).toBe(8);
    expect(layout.opponents.cellSize).toBe(8);
  });
});

describe('layoutOpponents: spectating, with no board of your own (design §13.2, Spectating)', () => {
  const BANNER = 96;
  const cases = [
    // A 1v1's two boards side by side, with their hold and preview.
    { viewport: W1600, count: 2, kind: 'full', cell: 32, columns: 2, rows: 1 },
    { viewport: W1600, count: 3, kind: 'small', cell: 32, columns: 3, rows: 1 },
    { viewport: W1600, count: 6, kind: 'small', cell: 16, columns: 6, rows: 1 },
    { viewport: W1600, count: 8, kind: 'small', cell: 16, columns: 8, rows: 1 },
    { viewport: W1280, count: 2, kind: 'full', cell: 24, columns: 2, rows: 1 },
    { viewport: W1280, count: 5, kind: 'small', cell: 16, columns: 5, rows: 1 },
  ] as const;
  for (const { viewport, count, kind, cell, columns, rows } of cases) {
    test(`${count} players in ${viewport.width}×${viewport.height}: ${columns}×${rows} ${kind} boards at ${cell} px`, () => {
      const layout = layoutOpponents(viewport, count, { own: false, top: BANNER });
      expectSound(viewport, layout);
      expect(layout.own).toBeNull();
      expect(layout.opponents).toMatchObject({ kind, cellSize: cell, columns, rows });
      expect(layout.opponents.spots).toHaveLength(count);
    });
  }

  test('keeps the top clear for the banner, and centres the grid in the rest', () => {
    const layout = layoutOpponents(W1600, 6, { own: false, top: BANNER });
    const placed = boxes(layout);
    for (const box of placed) expect(box.y).toBeGreaterThanOrEqual(BANNER);
    const left = Math.min(...placed.map(({ x }) => x));
    const right = Math.max(...placed.map(({ x, width }) => x + width));
    expect(Math.abs(left - (W1600.width - right))).toBeLessThanOrEqual(1);
  });

  test('gives every board the same size, never below 8 px a cell', () => {
    const tiny = { width: 400, height: 300, pixelRatio: 1 };
    const layout = layoutOpponents(tiny, 8, { own: false, top: BANNER });
    expect(layout.opponents.cellSize).toBe(8);
    expect(new Set(boxes(layout).map(({ width, height }) => `${width}x${height}`)).size).toBe(1);
  });
});
