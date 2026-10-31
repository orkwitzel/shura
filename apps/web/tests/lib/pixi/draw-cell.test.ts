import { type CanvasDrawing, type Rgb, SKINS } from '@shura/client-core';
import { describe, expect, test } from 'vitest';
import { type CellTarget, drawCell } from '@/lib/pixi/draw-cell';

interface Filled {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: number;
  readonly alpha: number;
}

/** A drawing target that keeps every filled rectangle, in order. */
function recorder(): CellTarget & { readonly filled: Filled[] } {
  const filled: Filled[] = [];
  return {
    filled,
    rect(x, y, width, height) {
      return {
        fill: ({ color, alpha }) => {
          filled.push({ x, y, width, height, color, alpha });
        },
      };
    },
  };
}

/** The colour and alpha last painted over the pixel at `x`, `y`, or undefined. */
function at(filled: readonly Filled[], x: number, y: number) {
  const over = filled.filter(
    (rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
  );
  const top = over.at(-1);
  return top && { color: top.color, alpha: top.alpha };
}

const T: Rgb = [200, 107, 250];
// T's colour; darkened 55 % (the edge): 90, 48, 113; lightened 50 % (Outline's shine): 228, 181, 253.
const T_COLOR = 0xc86bfa;
const T_EDGE = 0x5a3071;
const T_SHINE = 0xe4b5fd;

describe('drawCell', () => {
  test('draws a 16-pixel Outline cell in art pixels 2 pixels wide', () => {
    const target = recorder();
    drawCell(target, { x: 100, y: 50, size: 16, color: T, drawing: SKINS.outline.canvas });
    const { filled } = target;
    // Art pixel (0, 0): the edge. (1, 1): the ring. (2, 2): the shine. (4, 4): the faint fill.
    expect(at(filled, 100, 50)).toEqual({ color: T_EDGE, alpha: 1 });
    expect(at(filled, 103, 53)).toEqual({ color: T_COLOR, alpha: 1 });
    expect(at(filled, 105, 55)).toEqual({ color: T_SHINE, alpha: 1 });
    expect(at(filled, 109, 59)).toEqual({ color: T_COLOR, alpha: 0.22 });
    expect(at(filled, 115, 65)).toEqual({ color: T_EDGE, alpha: 1 });
  });

  test('paints only inside the cell', () => {
    for (const skin of Object.values(SKINS)) {
      const target = recorder();
      drawCell(target, { x: 100, y: 50, size: 16, color: T, drawing: skin.canvas });
      expect(at(target.filled, 99, 50)).toBeUndefined();
      expect(at(target.filled, 116, 50)).toBeUndefined();
      expect(at(target.filled, 100, 66)).toBeUndefined();
    }
  });

  test('each skin draws its own cell from the same colour', () => {
    const shine = (drawing: CanvasDrawing) => {
      const target = recorder();
      drawCell(target, { x: 0, y: 0, size: 8, color: T, drawing });
      return at(target.filled, 2, 2);
    };
    expect(shine(SKINS.pixel.canvas)).toEqual({ color: 0xffffff, alpha: 1 });
    expect(shine(SKINS.flat.canvas)).toEqual({ color: T_COLOR, alpha: 1 });
    expect(shine(SKINS.outline.canvas)).toEqual({ color: T_SHINE, alpha: 1 });
  });
});
