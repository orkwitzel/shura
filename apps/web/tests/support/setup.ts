import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { installMatchMedia, resetMatchMedia } from './match-media';

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
  });
}
