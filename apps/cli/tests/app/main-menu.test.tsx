import { afterEach, describe, expect, it } from 'vitest';
import { COUNTDOWN_MS, KEYS, shuraApp } from '../support/solo-app';
import { memoryStores } from '../support/stores';

/** A personal best as records.json keeps it (design §13.1). */
function best(stats: {
  outcome: string;
  score: number;
  lines: number;
  level: number;
  frames: number;
}) {
  return {
    date: '2026-10-01T12:00:00.000Z',
    engineVersion: 1,
    seed: 7,
    stats: { pieces: 100, ...stats },
    actions: [],
  };
}

const RECORDS = {
  version: 1,
  sprint: best({ outcome: 'finished', score: 9_000, lines: 40, level: 1, frames: 2_700 }),
  marathon: best({ outcome: 'finished', score: 171_349, lines: 150, level: 15, frames: 40_650 }),
  ultra: best({ outcome: 'finished', score: 21_449, lines: 30, level: 1, frames: 7_200 }),
};

type App = Awaited<ReturnType<typeof shuraApp>>;

let app: App | undefined;
afterEach(() => app?.app.unmount());

async function start(options: Parameters<typeof shuraApp>[0] = {}): Promise<App> {
  app = await shuraApp(options);
  return app;
}

/** A frame's non-blank lines, trimmed, with runs of spaces cut to two. */
function lines(frame: string): string[] {
  return frame
    .split('\n')
    .map((line) => line.trim().replace(/\s{2,}/g, '  '))
    .filter((line) => line !== '');
}

describe('the main menu', () => {
  it('is what shura opens on, with the cursor on Single player', async () => {
    const app = await start();
    expect(lines(app.frame())).toEqual([
      'SHURA',
      'Play online  coming soon',
      '› Single player',
      'Settings',
      'Quit',
      '↑↓ choose  Enter select',
    ]);
  });

  it('moves the cursor with ↑ and ↓, passing over Play online and stopping at the ends', async () => {
    const app = await start();
    await app.type(KEYS.up);
    expect(lines(app.frame())).toContain('› Single player');
    await app.type(KEYS.down);
    expect(lines(app.frame())).toContain('› Settings');
    await app.type(KEYS.down);
    await app.type(KEYS.down);
    expect(lines(app.frame())).toContain('› Quit');
  });

  it('ignores Enter on its release, and Esc', async () => {
    const app = await start();
    await app.type(KEYS.down);
    await app.type(KEYS.enterUp);
    await app.type(KEYS.escape);
    expect(lines(app.frame())).toContain('› Settings');
  });

  it('opens the settings, and Esc there comes back to the menu, on Settings', async () => {
    const app = await start();
    await app.type(KEYS.down);
    await app.type(KEYS.enter);
    expect(lines(app.frame())[0]).toBe('SETTINGS');
    await app.type(KEYS.escape);
    expect(lines(app.frame())[0]).toBe('SHURA');
    expect(lines(app.frame())).toContain('› Settings');
  });

  it('opens Single player with Enter: each mode with its personal best', async () => {
    const app = await start();
    await app.type(KEYS.enter);
    expect(lines(app.frame())).toEqual([
      'SINGLE PLAYER',
      '› Sprint  no record yet',
      'Marathon  no record yet',
      'Ultra  no record yet',
      '↑↓ choose  Enter play  Esc back',
    ]);
  });

  it('shows the saved personal bests: Sprint’s time, Marathon’s score, level and lines, Ultra’s score', async () => {
    const app = await start({ stores: memoryStores({ records: RECORDS }) });
    await app.type(KEYS.enter);
    expect(lines(app.frame()).slice(1, 4)).toEqual([
      '› Sprint  0:45.000',
      'Marathon  171,349 (level 15, 150 lines)',
      'Ultra  21,449',
    ]);
  });

  it('goes back from Single player with Esc, onto Single player', async () => {
    const app = await start();
    await app.type(KEYS.enter);
    await app.type(KEYS.escape);
    expect(lines(app.frame())[0]).toBe('SHURA');
    expect(lines(app.frame())).toContain('› Single player');
  });

  it.each([
    ['Sprint', 0, ' 0/40 '],
    ['Marathon', 1, ' 0/150 '],
    ['Ultra', 2, ' TIME LEFT '],
  ])('plays %s, from the countdown', async (_, downs, hud) => {
    const app = await start();
    await app.type(KEYS.enter);
    for (let i = 0; i < downs; i++) await app.type(KEYS.down);
    await app.type(KEYS.enter);
    expect(app.frame().replace(/\s+/g, ' ')).toContain(hud);
    expect(app.frame()).toMatch(/│\s+3\s+│/);
  });

  it('says in short when a stored file was unusable', async () => {
    const app = await start({ stores: memoryStores({ config: '{ broken' }) });
    expect(lines(app.frame()).at(-1)).toBe('config.json invalid: using the defaults');
  });

  it('ignores its keys while the terminal is too small to show it', async () => {
    const app = await start();
    await app.resize(79, 24);
    await app.type(KEYS.down);
    await app.type(KEYS.enter);
    await app.resize(80, 24);
    expect(lines(app.frame())[0]).toBe('SHURA');
    expect(lines(app.frame())).toContain('› Single player');
  });

  it('quits with Quit', async () => {
    const app = await start();
    await app.type(KEYS.down);
    await app.type(KEYS.down);
    await app.type(KEYS.enter);
    // The app exits and its output is cleared.
    expect(app.frame()).toBe('');
  });
});

/** Opens Single player and plays the mode `downs` entries down. */
async function play(app: App, downs = 0) {
  await app.type(KEYS.enter);
  for (let i = 0; i < downs; i++) await app.type(KEYS.down);
  await app.type(KEYS.enter);
  await app.type(KEYS.enterUp);
}

/** Hard drops until the stack tops out and the results show. */
async function topOut(app: App) {
  await app.run(COUNTDOWN_MS + 100);
  for (let i = 0; i < 30 && !app.frame().includes('GAME OVER'); i++) {
    await app.type(KEYS.space);
    await app.run(20);
  }
  expect(app.frame()).toContain('GAME OVER');
}

describe('coming back from a game', () => {
  it('Quit to menu stops the game and opens the menu on the mode played', async () => {
    const app = await start();
    await play(app, 2);
    await app.run(COUNTDOWN_MS + 500);
    await app.type(KEYS.escape);
    await app.type(KEYS.letter('q'));
    expect(lines(app.frame())[0]).toBe('SINGLE PLAYER');
    expect(lines(app.frame())).toContain('› Ultra  no record yet');
    expect(app.clock.pending).toBe(0);
  });

  it.each([
    ['Enter', KEYS.enter, KEYS.enterUp],
    ['Esc', KEYS.escape, '\x1b[27;1:3u'],
  ])('%s on the results opens the menu, with the new personal best', async (_, key, release) => {
    const app = await start();
    await play(app, 1);
    await topOut(app);
    await app.type(key);
    await app.type(release);
    expect(lines(app.frame())[0]).toBe('SINGLE PLAYER');
    expect(lines(app.frame())).toContainEqual(
      expect.stringMatching(/^› Marathon {2}\d[\d,]* \(level 1, 0 lines\)$/),
    );
  });

  it('a game played again from the menu is a new game', async () => {
    const app = await start();
    await play(app);
    await app.run(COUNTDOWN_MS + 1_000);
    await app.type(KEYS.escape);
    await app.type(KEYS.letter('q'));
    await app.type(KEYS.enter);
    expect(app.frame()).toMatch(/│\s+3\s+│/);
    expect(app.frame()).toContain('0:00.000');
  });

  it('shura solo <mode> comes back to the menu too, on that mode', async () => {
    const app = await start({ mode: 'marathon' });
    await app.run(COUNTDOWN_MS + 500);
    await app.type(KEYS.escape);
    await app.type(KEYS.letter('q'));
    expect(lines(app.frame())[0]).toBe('SINGLE PLAYER');
    expect(lines(app.frame())).toContain('› Marathon  no record yet');
    await app.type(KEYS.escape);
    expect(lines(app.frame())).toContain('› Single player');
  });
});
