import { Graphics } from 'pixi.js';
import { drawShapes } from '@/lib/pixi/draw-shapes';
import { layerOf, type PixiTarget } from '@/lib/pixi/pixi-app';
import {
  type EffectView,
  effectFrame,
  type RunningEffect,
  startEffects,
} from '../utils/effect-frame';
import type { Effect } from '../utils/effects-for-events';

/**
 * Draws effects over a board painted on the same target, and shakes or nudges that target (an
 * application's whole stage, or a board's layer). Thin and untested (design §13.2): what to draw
 * comes from `effectFrame`.
 */
export interface EffectsPainter {
  /** Starts `effects` at `now` (ms), each after its delay. */
  add(effects: readonly Effect[], now: number): void;
  /** Drops every effect, as a new game starts or effects are turned off. */
  clear(): void;
  /** Draws the running effects as they are at `now` over `view`'s board. */
  paint(view: EffectView, now: number): void;
}

export function createEffectsPainter(target: PixiTarget): EffectsPainter {
  const layer = layerOf(target);
  const graphics = new Graphics();
  // Added after the board's graphics, so effects are drawn over the board.
  layer.addChild(graphics);
  let running: readonly RunningEffect[] = [];
  /** What was last drawn, to skip frames that would draw the same. */
  let drawn: { view: EffectView; changing: boolean } | null = null;

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
      layer.position.set(0, 0);
    },
    paint(view, now) {
      if (drawn !== null && drawn.view === view && !drawn.changing) return;
      const frame = effectFrame(running, now, view);
      running = frame.running;
      graphics.clear();
      drawShapes(graphics, frame.shapes);
      layer.position.set(frame.offset.x, frame.offset.y);
      drawn = { view, changing: frame.changing };
    },
  };
}
