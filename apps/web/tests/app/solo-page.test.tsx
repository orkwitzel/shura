import { ActionType } from '@shura/engine';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppRouter } from '@/app/router';
// The engine's recorded Sprint (design §5.3): a full game whose action log finishes it.
import sprint from '../../../../packages/engine/recorded-matches/sprint.json';
import { pixiApps, tickPixi } from '../support/fake-pixi';
import { renderWithStores } from '../support/render-with-stores';

/** The countdown before Go (design §13.1). */
const COUNTDOWN_MS = 1_500;

/** A default web key (design §7.4) for each action of the recorded game. */
const KEYS: Record<string, string> = {
  [ActionType.MoveLeft]: 'ArrowLeft',
  [ActionType.MoveRight]: 'ArrowRight',
  [ActionType.HardDrop]: 'Space',
  [ActionType.RotateCW]: 'KeyX',
  [ActionType.RotateCCW]: 'ControlLeft',
  [ActionType.Rotate180]: 'KeyA',
  [ActionType.Hold]: 'ShiftLeft',
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Lets the Pixi app's asynchronous start-up finish. */
const started = () => act(async () => {});

/** Moves the fake time on to `time`, through every animation frame on the way. */
const runTo = (time: number) => act(() => vi.advanceTimersByTime(time - performance.now()));

/** Taps a key: a keydown and a keyup on the window. */
const tap = (code: string) =>
  act(() => {
    fireEvent.keyDown(window, { code });
    fireEvent.keyUp(window, { code });
  });

/** A HUD value, found by its label. */
const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling;

describe('/solo/sprint', () => {
  test('shows the board, with the HUD beside it', async () => {
    renderWithStores(<AppRouter />, { path: '/solo/sprint' });
    await started();
    expect(screen.getByRole('heading', { name: 'Sprint' })).toBeInTheDocument();
    expect(pixiApps).toHaveLength(1);
    expect(stat('Time')).toHaveTextContent('0:00.000');
    expect(stat('Lines')).toHaveTextContent('0/40');
    tickPixi();
    expect(pixiApps[0]?.painted).toHaveLength(1);
  });

  test('game keys are kept from scrolling the page, and other keys aren’t', async () => {
    renderWithStores(<AppRouter />, { path: '/solo/sprint' });
    await started();
    // fireEvent returns false when the default was prevented.
    expect(fireEvent.keyDown(window, { code: 'Space' })).toBe(false);
    expect(fireEvent.keyUp(window, { code: 'Space' })).toBe(false);
    expect(fireEvent.keyDown(window, { code: 'ArrowDown', repeat: true })).toBe(false);
    expect(fireEvent.keyDown(window, { code: 'KeyQ' })).toBe(true);
    expect(fireEvent.keyDown(window, { code: 'Tab' })).toBe(true);
  });

  test('plays a full Sprint with the default web bindings, then shows its time', async () => {
    // The session's fresh seed comes from Math.random: make it the recorded game's.
    vi.spyOn(Math, 'random').mockReturnValue(sprint.seed / 2 ** 32);
    const start = performance.now();
    const app = renderWithStores(<AppRouter />, { path: '/solo/sprint' });
    await started();
    const go = start + COUNTDOWN_MS;
    // Each action's key arrives 1 ms into the frame before the action's, so it applies at its frame.
    for (const { frame, type } of sprint.players[0]?.actions ?? []) {
      runTo(go + ((frame - 1) * 1000) / 60 + 1);
      const key = KEYS[type];
      if (key === undefined) throw new Error(`no key for ${type}`);
      tap(key);
    }
    runTo(performance.now() + 1_000);

    // The recorded game finishes 40 lines at frame 1,222: 20.367 s.
    expect(stat('Lines')).toHaveTextContent('40/40');
    expect(screen.getByText('Finished')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0:20.367');
    // The game ended, so it was recorded.
    expect(app.stores.records.getState().sprint?.stats.frames).toBe(1_222);
  });

  test('leaving the route destroys the Pixi app and stops the loop and the keys', async () => {
    const app = renderWithStores(<AppRouter />, { path: '/solo/sprint' });
    await started();
    act(() => app.navigate('/'));
    expect(pixiApps[0]?.destroyed).toBe(true);
    expect(pixiApps[0]?.ticker.callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(fireEvent.keyDown(window, { code: 'Space' })).toBe(true);
  });
});
