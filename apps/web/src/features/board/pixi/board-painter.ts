import { type Application, Graphics } from 'pixi.js';
import { drawCell } from '@/lib/pixi/draw-cell';
import { colorNumber } from '@/utils/color';
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
      for (const shape of layout.shapes) {
        if (shape.type === 'cell') drawCell(graphics, shape);
        else {
          graphics
            .rect(shape.x, shape.y, shape.width, shape.height)
            .fill({ color: colorNumber(shape.color) });
        }
      }
    },
  };
}
