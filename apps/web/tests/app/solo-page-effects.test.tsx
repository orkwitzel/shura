import type { Effects } from '@shura/client-core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
// The engine's recorded Sprint (design §5.3): a full game whose action log finishes it.
import sprint from '../../../../packages/engine/recorded-matches/sprint.json';
import { pixiApps } from '../support/fake-pixi';
import { dialog, finishRecorded } from '../support/solo-game';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Plays the recorded Sprint with `effects`: what it ended on, and how many effects it started. */
async function sprintWith(effects: Effects) {
  const app = await finishRecorded('/solo/sprint', 'Sprint', sprint, {
    stored: { settings: { version: 1, effects } },
  });
  const result = {
    frames: app.stores.records.getState().sprint?.stats.frames,
    results: dialog('Finished')?.textContent,
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
    // The recorded game finishes 40 lines at frame 1,222: 20.367 s.
    expect(full.frames).toBe(1_222);
    expect(off.frames).toBe(1_222);
    expect(full.results).toContain('0:20.367');
    expect(off.results).toContain('0:20.367');
  });
});
