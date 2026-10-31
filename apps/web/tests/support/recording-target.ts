import type { CellTarget } from '@/lib/pixi/draw-cell';

/** A rectangle filled on a `recordingTarget`. */
export interface Filled {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: number;
  readonly alpha: number;
}

/** A drawing target that keeps every filled rectangle, in order. */
export function recordingTarget(): CellTarget & { readonly filled: Filled[] } {
  const filled: Filled[] = [];
  return {
    filled,
    rect(x, y, width, height) {
      return {
        fill: ({ color, alpha }) => {
          filled.push({ x, y, width, height, color, alpha });
        },
      };
    },
  };
}
