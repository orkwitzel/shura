import { SKINS, type SkinId, THEMES, type ThemeId } from '@shura/client-core';
import type { PieceKind } from '@shura/engine';
import { useEffect, useRef } from 'react';
import { type CellTarget, drawCell } from '@/lib/pixi/draw-cell';

export interface SkinPreviewProps {
  readonly skin: SkinId;
  readonly theme: ThemeId;
}

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

/** A Canvas 2D context as something `drawCell` draws into. */
function canvasTarget(context: CanvasRenderingContext2D): CellTarget {
  return {
    rect: (x, y, width, height) => ({
      fill: ({ color, alpha }) => {
        context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        context.globalAlpha = alpha;
        context.fillRect(x, y, width, height);
      },
    }),
  };
}

/**
 * A few cells drawn in `skin`, in `theme`'s piece colours, on a canvas at the device's pixel ratio
 * so the pixel art stays sharp. They are drawn as the board draws them: client-core's skin data,
 * through `drawCell`. Decoration: the skin's name says which it is.
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
    const target = canvasTarget(context);
    for (const [col, row, kind] of CELLS) {
      drawCell(target, {
        x: col * ART_SIZE,
        y: row * ART_SIZE,
        size: ART_SIZE,
        color: THEMES[theme].pieces[kind].rgb,
        drawing: SKINS[skin].canvas,
      });
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
