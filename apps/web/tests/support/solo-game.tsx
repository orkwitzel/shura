import { ActionType } from '@shura/engine';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { AppRouter } from '@/app/router';
import { tickPixi } from './fake-pixi';
import { renderWithStores } from './render-with-stores';

/**
 * Helpers for tests that play a game route (`/solo/:mode`) with fake animation frames and time:
 * call `vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame',
 * 'performance'] })` before each test.
 */

/** The countdown before Go (design §13.1). */
export const COUNTDOWN_MS = 1_500;

/** A default web key (design §7.4) for each action of a recorded game. */
const KEYS: Record<string, string> = {
  [ActionType.MoveLeft]: 'ArrowLeft',
  [ActionType.MoveRight]: 'ArrowRight',
  [ActionType.SoftDrop]: 'ArrowDown',
  [ActionType.HardDrop]: 'Space',
  [ActionType.RotateCW]: 'KeyX',
  [ActionType.RotateCCW]: 'ControlLeft',
  [ActionType.Rotate180]: 'KeyA',
  [ActionType.Hold]: 'ShiftLeft',
};

/** Lets the page load and the Pixi app's asynchronous start-up finish. */
async function started(name: string) {
  await screen.findByRole('heading', { name });
  await act(async () => {});
}

/**
 * Draws the board's first frame and the next, after which the game starts (its countdown). Returns
 * the time it started at.
 */
function shown() {
  act(() => {
    tickPixi();
    tickPixi();
  });
  return performance.now();
}

type Stored = Parameters<typeof renderWithStores>[1];

/** Opens a game route and waits until its board is on screen; returns the time the game started. */
export async function play(path: string, name: string, stored?: Stored) {
  const app = renderWithStores(<AppRouter />, { ...stored, path });
  await started(name);
  return { app, start: shown() };
}

/** A dialog by its title, if it is open. */
export const dialog = (name: string) => screen.queryByRole('dialog', { name });

/** The results' value for `label`. */
export const result = (results: HTMLElement | null, label: string) =>
  within(results as HTMLElement).getByText(label, { selector: 'dt' }).nextElementSibling;

/** The personal best line in the results. */
export const personalBestLine = (results: HTMLElement | null) =>
  within(results as HTMLElement).getByRole('status');

/** Moves the fake time on to `time`, through every animation frame on the way. */
export const runTo = (time: number) => act(() => vi.advanceTimersByTime(time - performance.now()));

const press = (code: string) =>
  act(() => {
    fireEvent.keyDown(window, { code });
  });

const release = (code: string) =>
  act(() => {
    fireEvent.keyUp(window, { code });
  });

/** Taps a key: a keydown and a keyup on the window. */
export const tap = (code: string) => {
  press(code);
  release(code);
};

/** A recorded game (design §5.3): its seed and its player's action log. */
export interface RecordedGame {
  readonly seed: number;
  readonly players: readonly { readonly actions: readonly { frame: number; type: string }[] }[];
}

/**
 * Plays a recorded game to its end through the default web keys, from `start`, then a second more.
 * Each action's key arrives 1 ms into the frame before the action's, so it applies at its frame. A
 * tap is one move, turn, hold or hard drop, but soft drop drops for as long as its key is held: its
 * key is pressed for the action's frame and released 1 ms into that frame, so it drops one row.
 */
export function playRecordedGame(game: RecordedGame, start: number) {
  const go = start + COUNTDOWN_MS;
  /** 1 ms into `frame`. */
  const into = (frame: number) => go + (frame * 1000) / 60 + 1;
  const softDrop = KEYS[ActionType.SoftDrop] as string;
  let releaseAt: number | null = null;
  const releaseSoftDrop = (before: number) => {
    if (releaseAt === null || releaseAt > before) return;
    runTo(releaseAt);
    release(softDrop);
    releaseAt = null;
  };
  for (const { frame, type } of game.players[0]?.actions ?? []) {
    const key = KEYS[type];
    if (key === undefined) throw new Error(`no key for ${type}`);
    const time = into(frame - 1);
    releaseSoftDrop(time);
    runTo(time);
    if (key === softDrop) {
      press(key);
      releaseAt = into(frame);
    } else {
      tap(key);
    }
  }
  releaseSoftDrop(Number.POSITIVE_INFINITY);
  runTo(performance.now() + 1_000);
}

/** Opens `path` with the recorded game's seed as the fresh one, and plays it to its end. */
export async function finishRecorded(
  path: string,
  name: string,
  game: RecordedGame,
  stored?: Stored,
) {
  // The session's fresh seed comes from Math.random: make it the recorded game's.
  vi.spyOn(Math, 'random').mockReturnValue(game.seed / 2 ** 32);
  const { app, start } = await play(path, name, stored);
  playRecordedGame(game, start);
  return app;
}
