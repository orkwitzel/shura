import type { CanvasDrawing, Rgb } from '@shura/client-core';
import { describe, expect, test } from 'vitest';
import { drawShapes } from '@/lib/pixi/draw-shapes';
import { recordingTarget } from '../../support/recording-target';

const RED: Rgb = [255, 0, 0];
/** A drawing of one art pixel, unshaded and half see-through, in a cell's top-left corner. */
const DOT: CanvasDrawing = [{ x: 0, y: 0, width: 1, height: 1, shade: 0, alpha: 0.5 }];

describe('drawShapes', () => {
  test('fills rectangles and draws cells as pixel art, in order', () => {
    const target = recordingTarget();
    drawShapes(target, [
      { type: 'rect', x: 1, y: 2, width: 3, height: 4, color: RED },
      { type: 'cell', x: 10, y: 20, size: 16, color: RED, drawing: DOT },
    ]);
    expect(target.filled).toEqual([
      { x: 1, y: 2, width: 3, height: 4, color: 0xff0000, alpha: 1 },
      { x: 10, y: 20, width: 2, height: 2, color: 0xff0000, alpha: 0.5 },
    ]);
  });

  test('draws each shape at its alpha, multiplying a cell’s own', () => {
    const target = recordingTarget();
    drawShapes(target, [
      { type: 'rect', x: 0, y: 0, width: 1, height: 1, color: RED, alpha: 0.25 },
      { type: 'cell', x: 0, y: 0, size: 8, color: RED, drawing: DOT, alpha: 0.5 },
    ]);
    expect(target.filled.map(({ alpha }) => alpha)).toEqual([0.25, 0.25]);
  });
});
