import { vi } from 'vitest';

/** A rectangle a fake 2D context filled, in its own (transformed) coordinates. */
export interface FilledRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fillStyle: string;
  readonly globalAlpha: number;
}

/** What a canvas's fake 2D context was last asked to draw, since it was last cleared. */
export interface Fake2d {
  readonly canvas: HTMLCanvasElement;
  readonly filled: FilledRect[];
}

/**
 * Gives every canvas a fake 2D context (happy-dom has none) that keeps the rectangles filled since
 * the last `clearRect`, each with the fill style and alpha in force. Returns the contexts made so
 * far, one per canvas. Restored after each test by `vi.restoreAllMocks`.
 */
export function installFake2d(): Fake2d[] {
  const contexts: Fake2d[] = [];
  const byCanvas = new Map<HTMLCanvasElement, CanvasRenderingContext2D>();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    kind: string,
  ) {
    if (kind !== '2d') return null;
    const existing = byCanvas.get(this);
    if (existing) return existing;
    const fake: Fake2d = { canvas: this, filled: [] };
    contexts.push(fake);
    const context = {
      fillStyle: '#000000',
      globalAlpha: 1,
      imageSmoothingEnabled: true,
      setTransform: () => {},
      clearRect: () => {
        fake.filled.length = 0;
      },
      fillRect(x: number, y: number, width: number, height: number) {
        fake.filled.push({
          x,
          y,
          width,
          height,
          fillStyle: this.fillStyle,
          globalAlpha: this.globalAlpha,
        });
      },
    };
    const typed = context as unknown as CanvasRenderingContext2D;
    byCanvas.set(this, typed);
    return typed;
  } as HTMLCanvasElement['getContext']);
  return contexts;
}

/** The fill style and alpha last painted over the point `x`, `y`, or undefined. */
export function paintedAt(fake: Fake2d, x: number, y: number) {
  const over = fake.filled.filter(
    (rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
  );
  const top = over.at(-1);
  return top && { fillStyle: top.fillStyle, globalAlpha: top.globalAlpha };
}
