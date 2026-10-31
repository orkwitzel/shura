import { type Application, Graphics } from 'pixi.js';
import { type CellTarget, drawCell } from '@/lib/pixi/draw-cell';
import { colorNumber } from '@/utils/color';
import {
  type EffectView,
  effectFrame,
  type RunningEffect,
  startEffects,
} from '../utils/effect-frame';
import type { Effect } from '../utils/effects-for-events';

/**
 * Draws effects over a board painted on the same Pixi application, and shakes or nudges the whole
 * stage. Thin and untested (design §13.2): what to draw comes from `effectFrame`.
 */
export interface EffectsPainter {
  /** Starts `effects` at `now` (ms), each after its delay. */
  add(effects: readonly Effect[], now: number): void;
  /** Drops every effect, as a new game starts or effects are turned off. */
  clear(): void;
  /** Draws the running effects as they are at `now` over `view`'s board. */
  paint(view: EffectView, now: number): void;
}

export function createEffectsPainter(app: Application): EffectsPainter {
  const graphics = new Graphics();
  // Added after the board's graphics, so effects are drawn over the board.
  app.stage.addChild(graphics);
  let running: readonly RunningEffect[] = [];
  /** What was last drawn, to skip frames that would draw the same. */
  let drawn: { view: EffectView; changing: boolean } | null = null;

  /** `graphics`, with every fill's alpha multiplied by `alpha`. */
  const faded = (alpha: number): CellTarget => ({
    rect: (x, y, width, height) => ({
      fill: (style) =>
        graphics.rect(x, y, width, height).fill({ ...style, alpha: style.alpha * alpha }),
    }),
  });

  return {
    add(effects, now) {
      if (effects.length === 0) return;
      running = [...running, ...startEffects(effects, now)];
      drawn = null;
    },
    clear() {
      // With nothing running, the last paint drew nothing and left the stage in place.
      if (running.length === 0) return;
      running = [];
      drawn = null;
      graphics.clear();
      app.stage.position.set(0, 0);
    },
    paint(view, now) {
      if (drawn !== null && drawn.view === view && !drawn.changing) return;
      const frame = effectFrame(running, now, view);
      running = frame.running;
      graphics.clear();
      for (const shape of frame.shapes) {
        if (shape.type === 'cell') drawCell(faded(shape.alpha), shape);
        else {
          graphics
            .rect(shape.x, shape.y, shape.width, shape.height)
            .fill({ color: colorNumber(shape.color), alpha: shape.alpha });
        }
      }
      app.stage.position.set(frame.offset.x, frame.offset.y);
      drawn = { view, changing: frame.changing };
    },
  };
}
