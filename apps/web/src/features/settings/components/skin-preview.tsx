import { type Rgb, type SkinId, THEMES, type ThemeId } from '@shura/client-core';
import type { PieceKind } from '@shura/engine';
import { useEffect, useRef } from 'react';

export interface SkinPreviewProps {
  readonly skin: SkinId;
  readonly theme: ThemeId;
}

/** One rectangle of a cell's 8×8 pixel art, its colour a shade of the cell's (as in #43's data). */
interface ArtRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 0 is the cell's colour; negative darkens it toward black, positive lightens it toward white. */
  readonly shade: number;
  readonly alpha?: number;
}

/**
 * Each skin's cell (design §13.1, Themes and skins). A stand-in until the skins' canvas drawings
 * live on client-core's `Skin` and `lib/pixi/draw-cell` draws them (#43, #49): then the preview
 * draws with that.
 */
const ART: Readonly<Record<SkinId, readonly ArtRect[]>> = {
  pixel: [
    { x: 0, y: 0, width: 8, height: 8, shade: -0.55 },
    { x: 1, y: 1, width: 6, height: 6, shade: 0 },
    { x: 1, y: 1, width: 6, height: 1, shade: 0.4 },
    { x: 1, y: 1, width: 1, height: 6, shade: 0.4 },
    { x: 1, y: 6, width: 6, height: 1, shade: -0.22 },
    { x: 6, y: 2, width: 1, height: 5, shade: -0.22 },
    { x: 2, y: 2, width: 1, height: 1, shade: 1 },
  ],
  flat: [
    { x: 0, y: 0, width: 8, height: 8, shade: -0.55 },
    { x: 1, y: 1, width: 6, height: 6, shade: 0 },
  ],
  outline: [
    { x: 0, y: 0, width: 8, height: 8, shade: 0, alpha: 0.2 },
    { x: 0, y: 0, width: 8, height: 1, shade: 0 },
    { x: 0, y: 7, width: 8, height: 1, shade: 0 },
    { x: 0, y: 1, width: 1, height: 6, shade: 0 },
    { x: 7, y: 1, width: 1, height: 6, shade: 0 },
  ],
};

/** The cells shown: a T and an O beside it, by column and row from the top-left. */
const CELLS: readonly (readonly [col: number, row: number, kind: PieceKind])[] = [
  [1, 0, 'T'],
  [0, 1, 'T'],
  [1, 1, 'T'],
  [2, 1, 'T'],
  [3, 0, 'O'],
  [4, 0, 'O'],
  [3, 1, 'O'],
  [4, 1, 'O'],
];

/** Art pixels per cell, and CSS pixels per art pixel. */
const ART_SIZE = 8;
const SCALE = 2;
const CELL = ART_SIZE * SCALE;
const COLUMNS = 5;
const ROWS = 2;

function shaded([red, green, blue]: Rgb, shade: number, alpha = 1): string {
  const toward = shade < 0 ? 0 : 255;
  const amount = Math.abs(shade);
  const mix = (channel: number) => Math.round(channel + (toward - channel) * amount);
  return `rgb(${mix(red)} ${mix(green)} ${mix(blue)} / ${alpha})`;
}

/**
 * A few cells drawn in `skin`, in `theme`'s piece colours, on a canvas at the device's pixel ratio
 * so the pixel art stays sharp. Decoration: the skin's name says which it is.
 */
export function SkinPreview({ skin, theme }: SkinPreviewProps) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = Math.max(1, Math.round(window.devicePixelRatio || 1));
    element.width = COLUMNS * CELL * ratio;
    element.height = ROWS * CELL * ratio;
    context.setTransform(ratio * SCALE, 0, 0, ratio * SCALE, 0, 0);
    context.clearRect(0, 0, COLUMNS * ART_SIZE, ROWS * ART_SIZE);
    for (const [col, row, kind] of CELLS) {
      const color = THEMES[theme].pieces[kind].rgb;
      for (const rect of ART[skin]) {
        context.fillStyle = shaded(color, rect.shade, rect.alpha);
        context.fillRect(col * ART_SIZE + rect.x, row * ART_SIZE + rect.y, rect.width, rect.height);
      }
    }
  }, [skin, theme]);

  return (
    <canvas
      ref={canvas}
      width={COLUMNS * CELL}
      height={ROWS * CELL}
      style={{ width: COLUMNS * CELL, height: ROWS * CELL, imageRendering: 'pixelated' }}
    />
  );
}
