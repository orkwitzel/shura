import type { CanvasDrawing, Rgb } from '@shura/client-core';
import type { Graphics } from 'pixi.js';
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
 * Draws a cell into `graphics` from a skin's drawing and a colour: each of the drawing's rectangles
 * of art pixels, in order, in the colour shaded as it says. The board and the settings screen's skin
 * previews share it.
 */
export function drawCell(graphics: Graphics, { x, y, size, color, drawing }: CellArt): void {
  const art = size / 8;
  for (const rect of drawing) {
    graphics
      .rect(x + rect.x * art, y + rect.y * art, rect.width * art, rect.height * art)
      .fill({ color: colorNumber(shade(color, rect.shade)), alpha: rect.alpha ?? 1 });
  }
}
