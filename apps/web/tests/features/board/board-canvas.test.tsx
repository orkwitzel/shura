import { createSoloSession, SKINS } from '@shura/client-core';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BoardCanvas } from '@/features/board/components/board-canvas';
import { fakeClock } from '../../support/fake-clock';
import { holdPixiInit, pixiApps, releasePixiInit, tickPixi } from '../../support/fake-pixi';
import { renderWithStores } from '../../support/render-with-stores';

beforeEach(() => {
  window.innerWidth = 1440;
  window.innerHeight = 900;
  window.devicePixelRatio = 1;
});
afterEach(() => {
  window.devicePixelRatio = 1;
});

function setup(onShown?: () => void) {
  const clock = fakeClock(1_000);
  const session = createSoloSession({ mode: 'sprint', clock, seed: 7 });
  const view = renderWithStores(<BoardCanvas session={session} {...(onShown && { onShown })} />);
  return { clock, session, view };
}

/** Lets the app's asynchronous start-up finish. */
const started = () => act(async () => {});

describe('BoardCanvas', () => {
  test('makes one Pixi app on mount, its canvas on the page, sized to the board', async () => {
    setup();
    await started();
    expect(pixiApps).toHaveLength(1);
    const [app] = pixiApps;
    expect(app?.canvas.isConnected).toBe(true);
    // 900 px high, 22.5 cells: 40 px cells, a layout 23 × 40 wide and 22.5 × 40 high.
    expect(app?.sizes).toEqual([{ width: 920, height: 900, resolution: 1 }]);
  });

  test('renders at the device pixel ratio', async () => {
    window.devicePixelRatio = 2;
    setup();
    await started();
    // 1800 physical pixels high: 80-pixel cells, 40 CSS pixels.
    expect(pixiApps[0]?.sizes).toEqual([{ width: 920, height: 900, resolution: 2 }]);
  });

  test('paints the session’s board on the ticker, and again only when something changed', async () => {
    const { clock } = setup();
    await started();
    const app = pixiApps[0];
    tickPixi();
    expect(app?.painted).toHaveLength(1);
    expect(app?.painted[0]?.shapes.some((shape) => shape.part === 'active')).toBe(true);
    tickPixi();
    expect(app?.painted).toHaveLength(1);
    act(() => clock.advance(20));
    tickPixi();
    expect(app?.painted).toHaveLength(2);
  });

  test('repaints with the new settings when they change', async () => {
    const { view } = setup();
    await started();
    const app = pixiApps[0];
    tickPixi();
    const ghosts = () =>
      app?.painted.at(-1)?.shapes.filter((shape) => shape.part === 'ghost').length;
    expect(ghosts()).toBe(4);
    act(() => view.stores.settings.update({ ghost: false }));
    tickPixi();
    expect(ghosts()).toBe(0);
  });

  test('repaints in the new skin as soon as it is picked', async () => {
    const { view } = setup();
    await started();
    const app = pixiApps[0];
    tickPixi();
    const drawings = () =>
      new Set(
        app?.painted
          .at(-1)
          ?.shapes.flatMap((shape) =>
            shape.type === 'cell' && shape.part === 'active' ? [shape.drawing] : [],
          ),
      );
    expect(drawings()).toEqual(new Set([SKINS.pixel.canvas]));
    for (const skin of ['outline', 'flat'] as const) {
      act(() => view.stores.settings.update({ skin }));
      tickPixi();
      expect(drawings()).toEqual(new Set([SKINS[skin].canvas]));
    }
  });

  test('works the cell size out again when the window is resized', async () => {
    setup();
    await started();
    window.innerHeight = 720;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    tickPixi();
    const app = pixiApps[0];
    // 720 / 22.5 = 32 px cells.
    expect(app?.sizes.at(-1)).toEqual({ width: 736, height: 720, resolution: 1 });
    expect(app?.painted.at(-1)?.height).toBe(720);
  });

  test('says once when the first painted board has been on screen for a tick', async () => {
    holdPixiInit();
    const onShown = vi.fn();
    setup(onShown);
    await act(async () => releasePixiInit());
    expect(onShown).not.toHaveBeenCalled();
    // The first tick paints; the next one comes after that frame was drawn.
    tickPixi();
    expect(onShown).not.toHaveBeenCalled();
    tickPixi();
    expect(onShown).toHaveBeenCalledOnce();
    tickPixi();
    expect(onShown).toHaveBeenCalledOnce();
  });

  test('labels the hold and the preview', async () => {
    setup();
    await started();
    expect(screen.getByText('Hold')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  test('unmounting destroys the app, leaving no ticker callback and no canvas', async () => {
    const { view } = setup();
    await started();
    const app = pixiApps[0];
    view.unmount();
    expect(app?.destroyed).toBe(true);
    expect(app?.ticker.callbacks.size).toBe(0);
    expect(app?.canvas.isConnected).toBe(false);
  });

  test('unmounting before the app has started destroys it once it has', async () => {
    holdPixiInit();
    const { view } = setup();
    view.unmount();
    await act(async () => releasePixiInit());
    const app = pixiApps[0];
    expect(app?.destroyed).toBe(true);
    expect(app?.ticker.callbacks.size).toBe(0);
    expect(app?.canvas.isConnected).toBe(false);
  });
});
