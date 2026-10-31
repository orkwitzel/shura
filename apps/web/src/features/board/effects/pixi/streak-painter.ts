import { Graphics } from 'pixi.js';
import { drawShapes } from '@/lib/pixi/draw-shapes';
import { layerOf, type PixiTarget } from '@/lib/pixi/pixi-app';
import { type RunningStreak, type StreakView, streakFrame } from '../utils/streak-frame';
import type { StreakEffect } from '../utils/streaks-for-routings';

/**
 * Draws attack streaks over every board of a match's stage. Thin and untested (design §13.2): what
 * to draw comes from `streakFrame`.
 */
export interface StreakPainter {
  /** Starts `streaks` at `now` (ms). */
  add(streaks: readonly StreakEffect[], now: number): void;
  /** Drops every streak, as effects are turned off. */
  clear(): void;
  /** Draws the running streaks as they are at `now`, over `view`'s boards. */
  paint(view: StreakView, now: number): void;
}

export function createStreakPainter(target: PixiTarget): StreakPainter {
  const graphics = new Graphics();
  // Added last, so streaks fly over every board.
  layerOf(target).addChild(graphics);
  let running: readonly RunningStreak[] = [];
  let drawn = false;
  return {
    add(streaks, now) {
      running = [...running, ...streaks.map((streak) => ({ streak, start: now }))];
    },
    clear() {
      running = [];
    },
    paint(view, now) {
      if (running.length === 0 && !drawn) return;
      const frame = streakFrame(running, now, view);
      running = frame.running;
      graphics.clear();
      drawShapes(graphics, frame.shapes);
      drawn = frame.shapes.length > 0;
    },
  };
}
