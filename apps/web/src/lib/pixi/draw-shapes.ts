import type { Rgb } from '@shura/client-core';
import { colorNumber } from '@/utils/color';
import { type CellArt, type CellTarget, drawCell } from './draw-cell';

interface Faded {
  /** How opaque it is drawn, 0 (clear) to 1 (as it is, without one). */
  readonly alpha?: number;
}

/** A filled rectangle, in the canvas's pixels. */
export interface RectArt extends Faded {
  readonly type: 'rect';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: Rgb;
}

/** A cell drawn as pixel art (`drawCell`). */
export interface CellShapeArt extends CellArt, Faded {
  readonly type: 'cell';
}

/** A shape to draw: what the board's layout and the effects' frames are made of. */
export type ShapeArt = RectArt | CellShapeArt;

/** `target`, with every fill's alpha multiplied by `alpha`. */
function faded(target: CellTarget, alpha: number): CellTarget {
  if (alpha === 1) return target;
  return {
    rect: (x, y, width, height) => ({
      fill: (style) =>
        target.rect(x, y, width, height).fill({ ...style, alpha: style.alpha * alpha }),
    }),
  };
}

/**
 * Draws `shapes` into `target` (a Pixi `Graphics`), in order: cells as pixel art with `drawCell`,
 * rectangles filled in their colour, each at its alpha. The board painter and the effects painter
 * share it.
 */
export function drawShapes(target: CellTarget, shapes: readonly ShapeArt[]): void {
  for (const shape of shapes) {
    const alpha = shape.alpha ?? 1;
    if (shape.type === 'cell') drawCell(faded(target, alpha), shape);
    else {
      target
        .rect(shape.x, shape.y, shape.width, shape.height)
        .fill({ color: colorNumber(shape.color), alpha });
    }
  }
}
