import type { Effect } from '@/features/board/effects/utils/effects-for-events';
import type { StreakEffect } from '@/features/board/effects/utils/streaks-for-routings';
import type { BoardShape } from '@/features/board/utils/layout-board';
import type { PixiSize } from '@/lib/pixi/pixi-app';

/** What a painter paints: a board's layout, or a small board's. */
export interface PaintedLayout {
  readonly width: number;
  readonly height: number;
  readonly shapes: readonly BoardShape[];
}

/** A layer on a fake app's stage: where it was placed. */
export interface FakeLayer {
  readonly app: FakePixiApp;
  x: number;
  y: number;
}

/**
 * Stand-ins for `@/lib/pixi/pixi-app`, the board painter, the effects painter and the streak
 * painter, since happy-dom has no WebGL. The setup file puts them in place for every test: an app
 * records its sizes, its ticker callbacks, the layouts painted onto it (any of its layers) and the
 * effects and streaks started on it, and `tickPixi` runs a tick.
 */
export interface FakePixiApp {
  readonly stage: FakeLayer;
  readonly canvas: HTMLCanvasElement;
  /** The size it was made at, then each resize. */
  readonly sizes: PixiSize[];
  readonly ticker: {
    readonly callbacks: Set<() => void>;
    add(callback: () => void): void;
    remove(callback: () => void): void;
  };
  /** The layouts painted onto it, in order. */
  readonly painted: PaintedLayout[];
  /** The effects started on it since they were last cleared, in order. */
  readonly effects: Effect[];
  /** The attack streaks started on it, in order. */
  readonly streaks: StreakEffect[];
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
      get stage(): FakeLayer {
        return stage;
      },
      canvas: document.createElement('canvas'),
      sizes: [size],
      ticker: {
        callbacks,
        add: (callback) => callbacks.add(callback),
        remove: (callback) => callbacks.delete(callback),
      },
      painted: [],
      effects: [],
      streaks: [],
      effectsCleared: 0,
      destroyed: false,
    };
    const stage: FakeLayer = { app, x: 0, y: 0 };
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
  layerOf: (target: FakePixiApp | FakeLayer): FakeLayer =>
    'stage' in target ? target.stage : target,
  addLayer: (target: FakePixiApp | FakeLayer): FakeLayer => ({ app: appOf(target), x: 0, y: 0 }),
  placeLayer(layer: FakeLayer, x: number, y: number) {
    layer.x = x;
    layer.y = y;
  },
};

/** The app a painter's target is on: the app itself, or one of its layers. */
const appOf = (target: FakePixiApp | FakeLayer): FakePixiApp =>
  'stage' in target ? target : target.app;

export const boardPainterModule = {
  createBoardPainter(target: FakePixiApp | FakeLayer) {
    return { paint: (layout: PaintedLayout) => appOf(target).painted.push(layout) };
  },
};

export const streakPainterModule = {
  createStreakPainter(target: FakePixiApp | FakeLayer) {
    const app = appOf(target);
    return {
      add: (streaks: readonly StreakEffect[]) => app.streaks.push(...streaks),
      clear: () => {
        app.streaks.length = 0;
      },
      paint: () => {},
    };
  },
};

export const effectsPainterModule = {
  createEffectsPainter(target: FakePixiApp | FakeLayer) {
    const app = appOf(target);
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
