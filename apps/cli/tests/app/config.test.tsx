import { existsSync, readFileSync } from 'node:fs';
import type { SoloMode } from '@shura/client-core';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/app';
import { exitMessages, openStores } from '../../src/app/stores';
import type { ColorMode } from '../../src/board/look';
import { fakeClock } from '../support/fake-clock';
import { resize, settle, visibleRows } from '../support/ink';
import { tempStorage } from '../support/temp-storage';

/** The countdown before Go: 1.5 s. */
const COUNTDOWN_MS = 1_500;

const RIGHT = '\x1b[C';
const D = '\x1b[100u';
const SPACE = '\x1b[32u';
const R = '\x1b[114u';

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
});

/**
 * `shura solo sprint` (seed 7: O first, in columns 4–5) with config.json and records.json in a
 * temporary XDG directory, on a fake clock, at 80×24.
 */
async function sprint(
  files: { config?: unknown; records?: unknown } = {},
  colors: ColorMode = 'none',
  mode: SoloMode = 'sprint',
) {
  const temp = tempStorage(files);
  const stores = openStores(temp.storage);
  const clock = fakeClock(1_000);
  const app = render(
    <App
      mode={mode}
      clock={clock}
      seed={7}
      colors={colors}
      input={{ choice: 'precise' }}
      {...stores}
    />,
  );
  cleanups.push(() => app.unmount(), temp.cleanup);
  resize(app, 80, 24);
  await settle();
  return {
    ...temp,
    stores,
    app,
    async type(bytes: string) {
      app.stdin.write(bytes);
      await settle();
    },
    async run(ms: number) {
      clock.run(ms);
      await settle();
    },
  };
}

describe('config.json', () => {
  it('sets the handling: with DAS and ARR at 0 a held direction reaches the wall at once', async () => {
    const rowAfterHoldingRight = async (config?: unknown) => {
      const game = await sprint(config === undefined ? {} : { config });
      await game.run(COUNTDOWN_MS + 20);
      await game.type(RIGHT);
      await game.run(50);
      return visibleRows(game.app.lastFrame())[0];
    };
    // The defaults (DAS 10 frames) move it once in 50 ms.
    expect(await rowAfterHoldingRight()).toBe(' . . . . .[][] . . .');
    const instant = { version: 1, handling: { das: 0, arr: 0 } };
    expect(await rowAfterHoldingRight(instant)).toBe(' . . . . . . . .[][]');
  });

  it('sets the bindings', async () => {
    const game = await sprint({ config: { version: 1, bindings: { moveRight: ['d'] } } });
    await game.run(COUNTDOWN_MS + 20);
    await game.type(D);
    await game.run(20);
    expect(visibleRows(game.app.lastFrame())[0]).toBe(' . . . . .[][] . . .');
  });

  it('turns the ghost off', async () => {
    const withGhost = await sprint();
    expect(withGhost.app.lastFrame()).toContain('::');
    const without = await sprint({ config: { version: 1, ghost: false } });
    expect(without.app.lastFrame()).not.toContain('::');
  });

  it('sets the skin', async () => {
    const game = await sprint({ config: { version: 1, skin: 'flat' } }, 'truecolor');
    expect(game.app.lastFrame()).toContain('▓▓▓▓');
    expect(game.app.lastFrame()).not.toContain('██');
  });

  it('that is invalid falls back to the defaults, with a message saying what is wrong', async () => {
    const game = await sprint({ config: { version: 1, handling: { das: 1_000 } } });
    expect(game.stores.notices).toHaveLength(1);
    expect(game.stores.notices[0]?.message).toContain(game.paths.settings);
    expect(game.stores.notices[0]?.message).toContain('handling.das');
    expect(game.stores.settings.getState().handling.das).toBe(167);
    expect(game.app.lastFrame()).toContain('config.json');
  });
});

describe('the messages on the way out', () => {
  it('are the stored files’ notices in full, then why the settings last failed to save', () => {
    const temp = tempStorage({ config: { version: 1, handling: { das: 1_000 } } });
    cleanups.push(temp.cleanup);
    const stores = openStores({
      ...temp.storage,
      write: () => {
        throw new Error('disk full');
      },
    });
    expect(exitMessages(stores)).toEqual([stores.notices[0]?.message]);
    stores.settings.update({ ghost: false });
    const problem = stores.settings.save();
    expect(problem).toContain('disk full');
    expect(exitMessages(stores)).toEqual([stores.notices[0]?.message, problem]);
  });
});

describe('records.json', () => {
  it('that is invalid moves to records.json.bak, with a message', async () => {
    const game = await sprint({ records: '{ broken' });
    expect(existsSync(game.paths.records)).toBe(false);
    expect(readFileSync(`${game.paths.records}.bak`, 'utf8')).toBe('{ broken');
    expect(game.stores.notices).toHaveLength(1);
    expect(game.stores.notices[0]?.message).toContain(`${game.paths.records}.bak`);
  });

  it("gets nothing from a Sprint top-out, and the results say it doesn't count", async () => {
    const game = await sprint();
    await game.run(COUNTDOWN_MS + 20);
    for (let drop = 0; drop < 20 && !game.app.lastFrame()?.includes('GAME OVER'); drop++) {
      await game.type(SPACE);
      await game.run(20);
    }
    expect(game.app.lastFrame()).toContain('GAME OVER');
    // The results wrap the line to their width.
    const results = game.app.lastFrame()?.replace(/\s+/g, ' ');
    expect(results).toContain("A top-out doesn't count for a personal best");
    expect(existsSync(game.paths.records)).toBe(false);
  });

  it('keeps a Marathon top-out as the first personal best, and the results say so', async () => {
    const game = await sprint({}, 'none', 'marathon');
    await game.run(COUNTDOWN_MS + 20);
    for (let drop = 0; drop < 20 && !game.app.lastFrame()?.includes('GAME OVER'); drop++) {
      await game.type(SPACE);
      await game.run(20);
    }
    expect(game.app.lastFrame()).toContain('New personal best!');
    const saved = JSON.parse(readFileSync(game.paths.records, 'utf8'));
    expect(saved).toMatchObject({
      version: 1,
      marathon: { seed: 7, stats: { outcome: 'gameOver' } },
    });
    expect(saved.marathon.actions.length).toBeGreaterThan(0);
  });

  it('records each game a restart plays, not just the first', async () => {
    const game = await sprint({}, 'none', 'marathon');
    const topOut = async () => {
      await game.run(COUNTDOWN_MS + 20);
      for (let drop = 0; drop < 20 && !game.app.lastFrame()?.includes('GAME OVER'); drop++) {
        await game.type(SPACE);
        await game.run(20);
      }
      return game.app.lastFrame()?.replace(/\s+/g, ' ');
    };
    expect(await topOut()).toContain('New personal best!');
    await game.type(R);
    // The same seed and the same drops: the same score again.
    expect(await topOut()).toContain('Equals your best');
  });
});
