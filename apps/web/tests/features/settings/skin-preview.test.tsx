import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SkinPreview } from '@/features/settings/components/skin-preview';
import { type Fake2d, installFake2d, paintedAt } from '../../support/fake-canvas-2d';

let contexts: Fake2d[];
beforeEach(() => {
  contexts = installFake2d();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// The preview's T fills the top middle cell of its first three columns: art pixels 8–15 across,
// 0–7 down. Its art pixel (2, 2) is (10, 2).
const T_SHINE_PIXEL = [10, 2] as const;

/** The preview's paint at an art pixel. */
function shine() {
  const [fake] = contexts;
  if (!fake) throw new Error('nothing drawn');
  return paintedAt(fake, ...T_SHINE_PIXEL);
}

describe('SkinPreview', () => {
  test('draws each skin’s cells as the board does, from client-core’s skins', () => {
    const view = render(<SkinPreview skin="pixel" theme="indigo" />);
    // Pixel's shine is white; Flat has none (the T's own colour); Outline's is T lightened 50 %.
    expect(shine()).toEqual({ fillStyle: '#ffffff', globalAlpha: 1 });
    view.rerender(<SkinPreview skin="flat" theme="indigo" />);
    expect(shine()).toEqual({ fillStyle: '#c86bfa', globalAlpha: 1 });
    view.rerender(<SkinPreview skin="outline" theme="indigo" />);
    expect(shine()).toEqual({ fillStyle: '#e4b5fd', globalAlpha: 1 });
  });

  test('Outline’s faint fill is see-through', () => {
    render(<SkinPreview skin="outline" theme="indigo" />);
    const [fake] = contexts;
    if (!fake) throw new Error('nothing drawn');
    // The T's art pixel (4, 4): its colour at 22 % alpha.
    expect(paintedAt(fake, 12, 4)).toEqual({ fillStyle: '#c86bfa', globalAlpha: 0.22 });
  });
});
