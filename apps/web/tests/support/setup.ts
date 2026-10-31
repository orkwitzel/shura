import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { resetFakePixi } from './fake-pixi';
import { installMatchMedia, resetMatchMedia } from './match-media';

// happy-dom has no WebGL, so every test draws boards with the stand-ins in fake-pixi.ts, which
// record what would have been drawn.
vi.mock('@/lib/pixi/pixi-app', async () => (await import('./fake-pixi')).pixiAppModule);
vi.mock(
  '@/features/board/pixi/board-painter',
  async () => (await import('./fake-pixi')).boardPainterModule,
);

// Tests that only read files run in the node environment (`@vitest-environment node`), with no
// window to set up.
if (typeof window !== 'undefined') {
  installMatchMedia();
  // Vitest runs without globals, so Testing Library can't clean up after each test on its own.
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute('style');
    resetMatchMedia();
    resetFakePixi();
  });
}
