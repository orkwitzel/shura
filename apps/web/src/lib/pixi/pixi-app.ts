import { Application, Container } from 'pixi.js';

/** A Pixi application's canvas size, in CSS pixels, and the pixel ratio it renders at. */
export interface PixiSize {
  readonly width: number;
  readonly height: number;
  readonly resolution: number;
}

/**
 * A Pixi application set up for Shura's pixel art (design §13.2, Boards): WebGL, a transparent
 * background, rendering at the device pixel ratio (`resolution`) with pixel rounding and no
 * antialiasing, so art pixels of whole physical pixels stay sharp. Its canvas takes its CSS size
 * from `width` and `height`. Make one per canvas, and `destroyPixiApp` it when done.
 */
export async function createPixiApp({ width, height, resolution }: PixiSize): Promise<Application> {
  const app = new Application();
  await app.init({
    preference: 'webgl',
    width,
    height,
    resolution,
    autoDensity: true,
    roundPixels: true,
    antialias: false,
    backgroundAlpha: 0,
  });
  return app;
}

/** Changes the size of an application's canvas, or its pixel ratio. */
export function resizePixiApp(app: Application, { width, height, resolution }: PixiSize): void {
  app.renderer.resize(width, height, resolution);
}

/**
 * Destroys an application: its ticker stops, its canvas leaves the page, and its WebGL context and
 * textures are released.
 */
export function destroyPixiApp(app: Application): void {
  app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
}

/** Where painters draw: an application's stage, or a layer on it. */
export type PixiTarget = Application | Container;

/** The container a target draws into: an application's stage, or the layer itself. */
export function layerOf(target: PixiTarget): Container {
  return target instanceof Application ? target.stage : target;
}

/**
 * A new layer on `target`, drawn over what is there already: a board's place on a match's stage,
 * which `placeLayer` moves.
 */
export function addLayer(target: PixiTarget): Container {
  const layer = new Container();
  layerOf(target).addChild(layer);
  return layer;
}

/** Moves a layer to `x`, `y` in its parent, in CSS pixels. */
export function placeLayer(layer: Container, x: number, y: number): void {
  layer.position.set(x, y);
}
