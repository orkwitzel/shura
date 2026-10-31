import { describe, expect, test } from 'vitest';
import { type CanvasDrawing, SKINS, THEMES } from '../src/index';

/**
 * Paints a skin's canvas drawing onto an 8×8 grid of art pixels, each named by the last shade
 * painted on it: `E` the edge (darkened 55 %), `C` the piece colour, `L` lightened 40 %, `H`
 * lightened 50 %, `D` darkened 22 %, `W` white, `f` the piece colour at 22 % alpha, `.` nothing.
 */
function paint(drawing: CanvasDrawing): string[] {
  const names = new Map([
    ['-0.55@1', 'E'],
    ['0@1', 'C'],
    ['0.4@1', 'L'],
    ['0.5@1', 'H'],
    ['-0.22@1', 'D'],
    ['1@1', 'W'],
    ['0@0.22', 'f'],
  ]);
  const grid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => '.'));
  for (const { x, y, width, height, shade, alpha = 1 } of drawing) {
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) {
        const line = grid[row];
        if (line) line[col] = names.get(`${shade}@${alpha}`) ?? '?';
      }
    }
  }
  return grid.map((line) => line.join(''));
}

describe('skins on canvas', () => {
  test('Pixel: a dark edge, a lit top-left, a shaded bottom-right and one shine pixel', () => {
    // The drawing as issue #43 words it, art pixel by art pixel.
    expect(paint(SKINS.pixel.canvas)).toEqual([
      'EEEEEEEE',
      'ELLLLLLE',
      'ELWCCCDE',
      'ELCCCCDE',
      'ELCCCCDE',
      'ELCCCCDE',
      'EDDDDDDE',
      'EEEEEEEE',
    ]);
  });

  test('Pixel is opaque', () => {
    for (const { alpha } of SKINS.pixel.canvas) expect(alpha ?? 1).toBe(1);
  });

  test('Flat: a dark edge round a cell of the piece colour', () => {
    // The drawing as issue #49 words it.
    expect(paint(SKINS.flat.canvas)).toEqual([
      'EEEEEEEE',
      'ECCCCCCE',
      'ECCCCCCE',
      'ECCCCCCE',
      'ECCCCCCE',
      'ECCCCCCE',
      'ECCCCCCE',
      'EEEEEEEE',
    ]);
  });

  test('Flat is opaque', () => {
    for (const { alpha } of SKINS.flat.canvas) expect(alpha ?? 1).toBe(1);
  });

  test('Outline: a dark edge, a ring of the piece colour on a faint fill, and one shine pixel', () => {
    // The drawing as issue #49 words it. The faint fill is painted over the edge.
    expect(paint(SKINS.outline.canvas)).toEqual([
      'EEEEEEEE',
      'ECCCCCCE',
      'ECHfffCE',
      'ECffffCE',
      'ECffffCE',
      'ECffffCE',
      'ECCCCCCE',
      'EEEEEEEE',
    ]);
  });

  test('every skin has a canvas drawing that stays on its 8×8 grid', () => {
    for (const skin of Object.values(SKINS)) {
      expect(skin.canvas.length).toBeGreaterThan(0);
      for (const { x, y, width, height } of skin.canvas) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + width).toBeLessThanOrEqual(8);
        expect(y + height).toBeLessThanOrEqual(8);
      }
    }
  });
});

// The prototype's web colours (issue #42), the source the themes' web groups were taken from.
describe('web theme colours', () => {
  test('every theme has them', () => {
    for (const theme of Object.values(THEMES)) {
      expect(theme.web.swirls).toHaveLength(3);
      expect(theme.web.well).toHaveLength(2);
    }
  });

  test('Indigo', () => {
    expect(THEMES.indigo.web).toEqual({
      panel: [0x2a, 0x1a, 0x4d],
      deep: [0x12, 0x08, 0x26],
      shadow: [0x0a, 0x04, 0x14],
      muted: [0xc9, 0xbf, 0xe0],
      swirls: [
        { rgb: [255, 77, 109], alpha: 0.45 },
        { rgb: [77, 124, 255], alpha: 0.5 },
        { rgb: [255, 210, 63], alpha: 0.25 },
      ],
      well: [
        [0x17, 0x0c, 0x2e],
        [0x1c, 0x10, 0x38],
      ],
    });
  });

  test('Plum', () => {
    expect(THEMES.plum.web).toEqual({
      panel: [0x3d, 0x16, 0x40],
      deep: [0x1a, 0x06, 0x19],
      shadow: [0x0a, 0x04, 0x14],
      muted: [0xc9, 0xbf, 0xe0],
      swirls: [
        { rgb: [255, 120, 60], alpha: 0.42 },
        { rgb: [255, 77, 170], alpha: 0.42 },
        { rgb: [120, 90, 255], alpha: 0.32 },
      ],
      well: [
        [0x1d, 0x08, 0x1c],
        [0x25, 0x0b, 0x24],
      ],
    });
  });

  test('Deep Sea', () => {
    expect(THEMES['deep-sea'].web).toEqual({
      panel: [0x10, 0x30, 0x4d],
      deep: [0x06, 0x14, 0x23],
      shadow: [0x0a, 0x04, 0x14],
      muted: [0xc9, 0xbf, 0xe0],
      swirls: [
        { rgb: [62, 224, 255], alpha: 0.32 },
        { rgb: [77, 124, 255], alpha: 0.45 },
        { rgb: [255, 77, 109], alpha: 0.3 },
      ],
      well: [
        [0x07, 0x18, 0x27],
        [0x0a, 0x1e, 0x31],
      ],
    });
  });
});
