import { Application } from 'pixi.js';

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
