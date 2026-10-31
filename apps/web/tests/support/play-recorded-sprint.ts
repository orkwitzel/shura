import { ActionType } from '@shura/engine';
import { act, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
// The engine's recorded Sprint (design §5.3): a full game whose action log finishes it.
import sprint from '../../../../packages/engine/recorded-matches/sprint.json';

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

/** The frame the recorded Sprint finishes its 40 lines on, and its time. */
export const RECORDED_SPRINT = { frames: 1_222, time: '0:20.367' } as const;

/**
 * Makes the next session's fresh seed the recorded Sprint's. Call it before rendering, with fake
 * `requestAnimationFrame` and `performance` timers, and `vi.restoreAllMocks()` after.
 */
export function seedRecordedSprint(): void {
  vi.spyOn(Math, 'random').mockReturnValue(sprint.seed / 2 ** 32);
}

/** Moves the fake time on to `time`, through every animation frame on the way. */
const runTo = (time: number) => act(() => vi.advanceTimersByTime(time - performance.now()));

/**
 * Plays the recorded Sprint on `/solo/sprint` through real key presses with the default web
 * bindings, from `start` (when the page was rendered): each key arrives 1 ms into the frame before
 * its action, so it applies at its frame. Then lets a second go by.
 */
export function playRecordedSprint(start: number): void {
  const go = start + COUNTDOWN_MS;
  for (const { frame, type } of sprint.players[0]?.actions ?? []) {
    runTo(go + ((frame - 1) * 1000) / 60 + 1);
    const key = KEYS[type];
    if (key === undefined) throw new Error(`no key for ${type}`);
    act(() => {
      fireEvent.keyDown(window, { code: key });
      fireEvent.keyUp(window, { code: key });
    });
  }
  runTo(performance.now() + 1_000);
}
