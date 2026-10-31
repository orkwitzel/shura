import type { CanvasDrawing, Rgb } from '@shura/client-core';
import { colorNumber, shade } from '@/utils/color';

/** A cell to draw: its top-left corner and size, in the canvas's pixels, its colour and its art. */
export interface CellArt {
  readonly x: number;
  readonly y: number;
  /** 8 art pixels: keep it a multiple of 8 physical pixels for sharp art. */
  readonly size: number;
  readonly color: Rgb;
  /** A skin's canvas drawing (client-core's `Skin.canvas`), or the ghost's. */
  readonly drawing: CanvasDrawing;
}

/**
 * What a cell is drawn into: a Pixi `Graphics` is one, and a Canvas 2D context can be wrapped as
 * one (the skin previews do).
 */
export interface CellTarget {
  rect(
    x: number,
    y: number,
    width: number,
    height: number,
  ): { fill(style: { color: number; alpha: number }): unknown };
}

/**
 * Draws a cell into `target` from a skin's drawing and a colour: each of the drawing's rectangles
 * of art pixels, in order, in the colour shaded as it says. The board and the settings screen's skin
 * previews share it, so they draw every skin alike.
 */
export function drawCell(target: CellTarget, { x, y, size, color, drawing }: CellArt): void {
  const art = size / 8;
  for (const rect of drawing) {
    target
      .rect(x + rect.x * art, y + rect.y * art, rect.width * art, rect.height * art)
      .fill({ color: colorNumber(shade(color, rect.shade)), alpha: rect.alpha ?? 1 });
  }
}
