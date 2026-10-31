import { ActionType } from '@shura/engine';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppRouter } from '@/app/router';
// The engine's recorded Sprint (design §5.3): a full game whose action log finishes it.
import sprint from '../../../../packages/engine/recorded-matches/sprint.json';
import { holdPixiInit, pixiApps, releasePixiInit, tickPixi } from '../support/fake-pixi';
import { personalBest } from '../support/records';
import { renderWithStores } from '../support/render-with-stores';

/** The countdown before Go (design §13.1). */
const COUNTDOWN_MS = 1_500;

/** The recorded Sprint's score: 28 singles and 6 doubles at level 1, plus its hard drops. */
const SPRINT_SCORE = '8,764';

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

/** Lets the page load and the Pixi app's asynchronous start-up finish. */
const started = async (name = 'Sprint') => {
  await screen.findByRole('heading', { name });
  await act(async () => {});
};

/**
 * Draws the board's first frame and the next, after which the game starts (its countdown). Returns
 * the time it started at.
 */
const shown = () => {
  act(() => {
    tickPixi();
    tickPixi();
  });
  return performance.now();
};

/** Opens a game route and waits until its board is on screen; returns the time the game started. */
async function play(path = '/solo/sprint', name = 'Sprint') {
  const app = renderWithStores(<AppRouter />, { path });
  await started(name);
  return { app, start: shown() };
}

/** The countdown over the board, if it shows. */
const countdown = () => screen.queryByRole('timer', { name: 'Countdown' });

/** A dialog by its title, if it is open. */
const dialog = (name: string) => screen.queryByRole('dialog', { name });

/** Moves the fake time on to `time`, through every animation frame on the way. */
const runTo = (time: number) => act(() => vi.advanceTimersByTime(time - performance.now()));

/** Taps a key: a keydown and a keyup on the window. */
const tap = (code: string) =>
  act(() => {
    fireEvent.keyDown(window, { code });
    fireEvent.keyUp(window, { code });
  });

/** A HUD value, found by its label (not the results' one). */
const stat = (label: string) =>
  screen.getAllByText(label, { selector: 'dt' }).find((term) => !term.closest('dialog'))
    ?.nextElementSibling;

/** The last board painted: the active piece's leftmost cell, and how many cells are locked. */
function board() {
  tickPixi();
  const shapes = pixiApps.at(-1)?.painted.at(-1)?.shapes ?? [];
  const active = shapes.filter((shape) => shape.part === 'active').map((shape) => shape.x);
  return {
    activeX: Math.min(...active),
    locked: shapes.filter((shape) => shape.part === 'locked').length,
  };
}

/** Plays the engine's recorded Sprint to its end through the default web keys, from `start`. */
function playRecordedSprint(start: number) {
  const go = start + COUNTDOWN_MS;
  // Each action's key arrives 1 ms into the frame before the action's, so it applies at its frame.
  for (const { frame, type } of sprint.players[0]?.actions ?? []) {
    runTo(go + ((frame - 1) * 1000) / 60 + 1);
    const key = KEYS[type];
    if (key === undefined) throw new Error(`no key for ${type}`);
    tap(key);
  }
  runTo(performance.now() + 1_000);
}

/** Opens the recorded Sprint's route, its seed the recorded one, and plays it to the end. */
async function finishRecordedSprint(stored?: Parameters<typeof renderWithStores>[1]) {
  // The session's fresh seed comes from Math.random: make it the recorded game's.
  vi.spyOn(Math, 'random').mockReturnValue(sprint.seed / 2 ** 32);
  const app = renderWithStores(<AppRouter />, { path: '/solo/sprint', ...stored });
  await started();
  playRecordedSprint(shown());
  return app;
}

/** The results' value for `label`. */
const result = (results: HTMLElement | null, label: string) =>
  within(results as HTMLElement).getByText(label, { selector: 'dt' }).nextElementSibling;

describe('/solo/sprint', () => {
  test('shows the board, with the HUD and the callouts beside it', async () => {
    renderWithStores(<AppRouter />, { path: '/solo/sprint' });
    await started();
    expect(screen.getByRole('status', { name: 'Callouts' })).toBeInTheDocument();
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

  test('plays a full Sprint with the default web bindings, and records it', async () => {
    const app = await finishRecordedSprint();
    // The recorded game finishes 40 lines at frame 1,222: 20.367 s.
    expect(stat('Lines')).toHaveTextContent('40/40');
    expect(dialog('Finished')).toHaveTextContent('0:20.367');
    // The engine's events reached the callouts: the lock that cleared the 40th line has some.
    expect(
      within(screen.getByRole('status', { name: 'Callouts' })).getAllByRole('listitem').length,
    ).toBeGreaterThan(0);
    // The game ended, so it was recorded.
    expect(app.stores.records.getState().sprint?.stats.frames).toBe(1_222);
  });

  test('leaving the route destroys the Pixi app and stops the loop and the keys', async () => {
    const { app } = await play();
    act(() => app.navigate('/'));
    expect(pixiApps[0]?.destroyed).toBe(true);
    expect(pixiApps[0]?.ticker.callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(fireEvent.keyDown(window, { code: 'Space' })).toBe(true);
  });
});

describe('the countdown', () => {
  // The loop wakes on animation frames, every 16 ms here, so each check comes a frame or two late.
  test('counts 3, 2, 1, GO, half a second each, then goes', async () => {
    const { start } = await play();
    expect(countdown()).toHaveTextContent('3');
    runTo(start + 530);
    expect(countdown()).toHaveTextContent('2');
    runTo(start + 1_030);
    expect(countdown()).toHaveTextContent('1');
    runTo(start + 1_530);
    expect(countdown()).toHaveTextContent('GO');
    runTo(start + 2_030);
    expect(countdown()).not.toBeInTheDocument();
    expect(stat('Time')).toHaveTextContent('0:00.5');
  });

  test('waits for the board to be on screen, however long Pixi takes to start', async () => {
    holdPixiInit();
    const before = performance.now();
    renderWithStores(<AppRouter />, { path: '/solo/sprint' });
    await screen.findByRole('heading', { name: 'Sprint' });
    // Pixi's start-up holds the main thread for 2 s: longer than a stall.
    runTo(before + 2_000);
    await act(async () => releasePixiInit());
    expect(countdown()).toHaveTextContent('3');
    const start = shown();
    expect(countdown()).toHaveTextContent('3');
    runTo(start + 1_030);
    expect(countdown()).toHaveTextContent('1');
    runTo(start + 1_530);
    expect(countdown()).toHaveTextContent('GO');
    expect(dialog('Paused')).not.toBeInTheDocument();
  });
});

describe('the in-game menu', () => {
  test.each([
    ['Esc', '{Escape}'],
    ['P', 'p'],
  ])('%s opens it during play, and the game stands still', async (_, key) => {
    const { start } = await play();
    runTo(start + COUNTDOWN_MS + 1_000);
    await userEvent.keyboard(key);
    expect(dialog('Paused')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Resume' })).toHaveFocus();
    const time = stat('Time')?.textContent ?? '';
    runTo(performance.now() + 2_000);
    expect(stat('Time')).toHaveTextContent(time);
  });

  test('Esc opens it during the countdown too', async () => {
    await play();
    await userEvent.keyboard('{Escape}');
    expect(dialog('Paused')).toBeInTheDocument();
  });

  test.each([
    ['Esc', '{Escape}'],
    ['Enter, on Resume', '{Enter}'],
  ])('%s resumes, through the countdown again', async (_, key) => {
    const { start } = await play();
    runTo(start + COUNTDOWN_MS + 1_000);
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard(key);
    expect(dialog('Paused')).not.toBeInTheDocument();
    expect(countdown()).toHaveTextContent('3');
    // It carries on from 1 s: half a second of play after the countdown, give or take a frame.
    runTo(performance.now() + COUNTDOWN_MS + 500);
    expect(stat('Time')).toHaveTextContent(/^0:01\.[45]\d\d$/);
  });

  test('R restarts: a new game, through the countdown', async () => {
    const { start } = await play();
    runTo(start + COUNTDOWN_MS + 1_000);
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('r');
    expect(dialog('Paused')).not.toBeInTheDocument();
    expect(countdown()).toHaveTextContent('3');
    expect(stat('Time')).toHaveTextContent('0:00.000');
  });

  test('S opens the settings over the paused game, and Esc leads back to the menu, on Settings', async () => {
    const { start } = await play();
    runTo(start + COUNTDOWN_MS + 1_000);
    await userEvent.keyboard('{Escape}');
    const time = stat('Time')?.textContent ?? '';
    await userEvent.keyboard('s');
    expect(dialog('Settings')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'DAS' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(dialog('Settings')).not.toBeInTheDocument();
    expect(dialog('Paused')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveFocus();
    expect(stat('Time')).toHaveTextContent(time);
  });

  test('the settings’ Back leads back to the menu too', async () => {
    await play();
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('s');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(dialog('Paused')).toBeInTheDocument();
  });

  test('Q quits to the main menu, and the game is not recorded', async () => {
    const { app, start } = await play();
    runTo(start + COUNTDOWN_MS + 1_000);
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('q');
    expect(app.location()).toBe('/');
    expect(screen.getByRole('menu', { name: 'Main menu' })).toBeInTheDocument();
    expect(app.stores.records.getState().sprint).toBeUndefined();
    expect(app.storage.texts.has('records')).toBe(false);
  });

  test('a key held through the menu stays held', async () => {
    await play();
    const spawn = board().activeX;
    fireEvent.keyDown(window, { code: 'ArrowRight' });
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');
    runTo(performance.now() + COUNTDOWN_MS + 500);
    // DAS charged through the countdown: the piece has shifted right.
    expect(board().activeX).toBeGreaterThan(spawn);
  });

  test('no key reaches the game while the settings are open, and held keys are let go as they open', async () => {
    await play();
    const spawn = board().activeX;
    fireEvent.keyDown(window, { code: 'ArrowRight' });
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('s');
    // Not kept from its default either: it's the settings screen's.
    expect(fireEvent.keyDown(window, { code: 'Space' })).toBe(true);
    fireEvent.keyUp(window, { code: 'Space' });
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');
    runTo(performance.now() + COUNTDOWN_MS + 500);
    expect(board()).toEqual({ activeX: spawn, locked: 0 });
  });
});

describe('losing focus and stalls', () => {
  test('losing focus mid-game opens the menu and lets go of a held key', async () => {
    await play();
    const spawn = board().activeX;
    fireEvent.keyDown(window, { code: 'ArrowRight' });
    act(() => {
      fireEvent.blur(window);
    });
    expect(dialog('Paused')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    runTo(performance.now() + COUNTDOWN_MS + 500);
    expect(board().activeX).toBe(spawn);
  });

  test('the page being hidden opens the menu', async () => {
    const { start } = await play();
    runTo(start + COUNTDOWN_MS + 500);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(dialog('Paused')).toBeInTheDocument();
  });

  test('a stall of more than 30 frames opens the menu', async () => {
    const { start } = await play();
    runTo(start + COUNTDOWN_MS + 500);
    // The main thread was held for a second: the next animation frame comes that much later.
    const now = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(now + 1_000);
    act(() => vi.advanceTimersToNextFrame());
    expect(dialog('Paused')).toBeInTheDocument();
  });
});

describe('the results', () => {
  test('a finished Sprint: its time, lines, pieces, pieces per second, score and level', async () => {
    await finishRecordedSprint();
    const results = dialog('Finished');
    expect(results).toHaveTextContent('Sprint');
    expect(results).toHaveTextContent('0:20.367');
    expect(result(results, 'Lines')).toHaveTextContent('40');
    // 109 pieces in 1,222 frames: 5.35 a second.
    expect(result(results, 'Pieces')).toHaveTextContent('109');
    expect(result(results, 'PPS')).toHaveTextContent('5.35');
    expect(result(results, 'Score')).toHaveTextContent(SPRINT_SCORE);
    expect(result(results, 'Level')).toHaveTextContent('1');
    expect(within(results as HTMLElement).getByRole('status')).toHaveTextContent(
      'New personal best!',
    );
  });

  test('says how far off the personal best a slower run was', async () => {
    const records = { version: 1, sprint: personalBest({ frames: 1_200 }) };
    const app = await finishRecordedSprint({ stored: { records } });
    // 22 frames slower than 20 s.
    expect(within(dialog('Finished') as HTMLElement).getByRole('status')).toHaveTextContent(
      '0.367 s off your best (0:20.000)',
    );
    expect(app.stores.records.getState().sprint?.stats.frames).toBe(1_200);
  });

  test('a top-out is Game over, and doesn’t count for a personal best', async () => {
    const { app, start } = await play();
    runTo(start + COUNTDOWN_MS + 20);
    for (let drop = 0; drop < 100 && !dialog('Game over'); drop++) {
      tap('Space');
      runTo(performance.now() + 50);
    }
    const results = dialog('Game over');
    expect(results).toBeInTheDocument();
    expect(within(results as HTMLElement).getByRole('status')).toHaveTextContent(
      "A top-out doesn't count for a personal best",
    );
    expect(app.stores.records.getState().sprint).toBeUndefined();
  });

  test('R plays again', async () => {
    await finishRecordedSprint();
    await userEvent.keyboard('r');
    expect(dialog('Finished')).not.toBeInTheDocument();
    expect(countdown()).toHaveTextContent('3');
    expect(stat('Lines')).toHaveTextContent('0/40');
  });

  test.each([
    ['Enter', '{Enter}'],
    ['Esc', '{Escape}'],
  ])('%s returns to the main menu, which shows the new best', async (_, key) => {
    const app = await finishRecordedSprint();
    await userEvent.keyboard(key);
    expect(app.location()).toBe('/');
    expect(screen.getByRole('menuitem', { name: 'Sprint' })).toHaveAccessibleDescription(
      '0:20.367',
    );
  });

  test('a finished Sprint’s best is on the main menu after a reload', async () => {
    const app = await finishRecordedSprint();
    app.unmount();
    // A reload: fresh stores, loaded from what was stored.
    renderWithStores(<AppRouter />, { stored: { records: app.storage.texts.get('records') } });
    expect(screen.getByRole('menuitem', { name: 'Sprint' })).toHaveAccessibleDescription(
      '0:20.367',
    );
  });
});
