import { Graphics } from 'pixi.js';
import { drawShapes, type ShapeArt } from '@/lib/pixi/draw-shapes';
import { layerOf, type PixiTarget } from '@/lib/pixi/pixi-app';

/** Paints board layouts onto a Pixi application's stage. Thin and untested (design §13.2). */
export interface BoardPainter {
  /** Replaces what was painted with `layout`'s shapes: a board's, or a small board's. */
  paint(layout: { readonly shapes: readonly ShapeArt[] }): void;
}

/** A painter onto `target`: an application's stage, or a board's layer on a match's stage. */
export function createBoardPainter(target: PixiTarget): BoardPainter {
  const graphics = new Graphics();
  layerOf(target).addChild(graphics);
  return {
    paint(layout) {
      graphics.clear();
      drawShapes(graphics, layout.shapes);
    },
  };
}
