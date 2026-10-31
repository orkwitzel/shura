import type { Effect } from '@/features/board/effects/utils/effects-for-events';
import type { BoardLayout } from '@/features/board/utils/layout-board';
import type { PixiSize } from '@/lib/pixi/pixi-app';

/**
 * Stand-ins for `@/lib/pixi/pixi-app`, the board painter and the effects painter, since happy-dom
 * has no WebGL. The setup file puts them in place for every test: an app records its sizes, its
 * ticker callbacks, the layouts painted onto it and the effects started on it, and `tickPixi` runs a
 * tick.
 */
export interface FakePixiApp {
  readonly canvas: HTMLCanvasElement;
  /** The size it was made at, then each resize. */
  readonly sizes: PixiSize[];
  readonly ticker: {
    readonly callbacks: Set<() => void>;
    add(callback: () => void): void;
    remove(callback: () => void): void;
  };
  /** The layouts painted onto it, in order. */
  readonly painted: BoardLayout[];
  /** The effects started on it since they were last cleared, in order. */
  readonly effects: Effect[];
  /** How many times its effects were cleared. */
  effectsCleared: number;
  destroyed: boolean;
}

/** Every app made since `resetFakePixi`, oldest first. */
export const pixiApps: FakePixiApp[] = [];

/** The calls to `createPixiApp` still waiting, while `holdPixiInit` holds them. */
let held: (() => void)[] | null = null;

/** Makes `createPixiApp` wait, as WebGL's start-up does, until `releasePixiInit`. */
export function holdPixiInit(): void {
  held = [];
}

/** Lets the held `createPixiApp` calls finish. */
export function releasePixiInit(): void {
  const waiting = held ?? [];
  held = null;
  for (const finish of waiting) finish();
}

export function resetFakePixi(): void {
  pixiApps.length = 0;
  held = null;
}

/** Runs one tick of every live app's ticker. */
export function tickPixi(): void {
  for (const app of pixiApps) {
    if (!app.destroyed) for (const callback of [...app.ticker.callbacks]) callback();
  }
}

export const pixiAppModule = {
  createPixiApp(size: PixiSize): Promise<FakePixiApp> {
    const callbacks = new Set<() => void>();
    const app: FakePixiApp = {
      canvas: document.createElement('canvas'),
      sizes: [size],
      ticker: {
        callbacks,
        add: (callback) => callbacks.add(callback),
        remove: (callback) => callbacks.delete(callback),
      },
      painted: [],
      effects: [],
      effectsCleared: 0,
      destroyed: false,
    };
    pixiApps.push(app);
    return new Promise((resolve) => {
      if (held) held.push(() => resolve(app));
      else resolve(app);
    });
  },
  resizePixiApp(app: FakePixiApp, size: PixiSize) {
    app.sizes.push(size);
  },
  destroyPixiApp(app: FakePixiApp) {
    if (app.destroyed) throw new Error('destroyed twice');
    app.destroyed = true;
    app.canvas.remove();
  },
};

export const boardPainterModule = {
  createBoardPainter(app: FakePixiApp) {
    return { paint: (layout: BoardLayout) => app.painted.push(layout) };
  },
};

export const effectsPainterModule = {
  createEffectsPainter(app: FakePixiApp) {
    return {
      add: (effects: readonly Effect[]) => app.effects.push(...effects),
      clear: () => {
        app.effects.length = 0;
        app.effectsCleared++;
      },
      paint: () => {},
    };
  },
};
