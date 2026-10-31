import type { Effects } from '@shura/client-core';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppRouter } from '@/app/router';
import { pixiApps } from '../support/fake-pixi';
import {
  playRecordedSprint,
  RECORDED_SPRINT,
  seedRecordedSprint,
} from '../support/play-recorded-sprint';
import { renderWithStores } from '../support/render-with-stores';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Plays the recorded Sprint with `effects`: what it ended on, and how many effects it started. */
async function sprintWith(effects: Effects) {
  seedRecordedSprint();
  const start = performance.now();
  const app = renderWithStores(<AppRouter />, {
    path: '/solo/sprint',
    stored: { settings: { version: 1, effects } },
  });
  // Lets the Pixi app's asynchronous start-up finish.
  await act(async () => {});
  playRecordedSprint(start);
  const result = {
    frames: app.stores.records.getState().sprint?.stats.frames,
    time: screen.getByText('Finished').closest('[role="status"]')?.textContent,
    effects: pixiApps.at(-1)?.effects.length ?? 0,
  };
  app.unmount();
  return result;
}

describe('effects on /solo/sprint', () => {
  test('a scripted Sprint ends on the same frame and time with effects Full and Off', async () => {
    const full = await sprintWith('full');
    const off = await sprintWith('off');
    // Full drew effects all the way; Off none.
    expect(full.effects).toBeGreaterThan(0);
    expect(off.effects).toBe(0);
    expect(full.frames).toBe(RECORDED_SPRINT.frames);
    expect(off.frames).toBe(RECORDED_SPRINT.frames);
    expect(full.time).toContain(RECORDED_SPRINT.time);
    expect(off.time).toContain(RECORDED_SPRINT.time);
  });
});
