import { type Application, Graphics } from 'pixi.js';
import { drawShapes } from '@/lib/pixi/draw-shapes';
import type { BoardLayout } from '../utils/layout-board';

/** Paints board layouts onto a Pixi application's stage. Thin and untested (design §13.2). */
export interface BoardPainter {
  /** Replaces what was painted with `layout`'s shapes. */
  paint(layout: BoardLayout): void;
}

export function createBoardPainter(app: Application): BoardPainter {
  const graphics = new Graphics();
  app.stage.addChild(graphics);
  return {
    paint(layout) {
      graphics.clear();
      drawShapes(graphics, layout.shapes);
    },
  };
}
