import type { SoloMode } from '@shura/client-core';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/ui/app';
import { fakeClock } from './support/fake-clock';
import { resize, settle, visibleRows, wallRows } from './support/ink';

/** The countdown before Go: 1.5 s. */
const COUNTDOWN_MS = 1_500;

const RIGHT = '\x1b[C';
const RIGHT_UP = '\x1b[1;1:3C';
const SPACE = '\x1b[32u';

let app: ReturnType<typeof render> | undefined;
afterEach(() => app?.unmount());

/** `shura solo <mode>` with seed 7 (O first, in columns 4–5) on a fake clock, at 80×24. */
async function solo(mode: SoloMode = 'sprint') {
  const clock = fakeClock(1_000);
  app = render(<App mode={mode} clock={clock} seed={7} colors="none" />);
  resize(app, 80, 24);
  await settle();
  const rendered = app;
  return {
    clock,
    app: rendered,
    async type(bytes: string) {
      rendered.stdin.write(bytes);
      await settle();
    },
    async run(ms: number) {
      clock.run(ms);
      await settle();
    },
  };
}

describe('shura solo sprint', () => {
  it('starts with the board, the queue and the status line, choosing an input adapter', async () => {
    const { app } = await solo();
    const frame = app.lastFrame() ?? '';
    expect(visibleRows(frame)).toHaveLength(20);
    expect(frame).toContain('NEXT');
    expect(frame).toContain('input: auto');
  });

  it('moves the piece with a Kitty-protocol press and release', async () => {
    const game = await solo();
    await game.run(COUNTDOWN_MS + 20);
    await game.type(RIGHT);
    await game.run(20);
    await game.type(RIGHT_UP);
    await game.run(20);
    expect(visibleRows(game.app.lastFrame())[0]).toBe(' . . . . .[][] . . .');
  });

  it('hard-drops with Space', async () => {
    const game = await solo();
    await game.run(COUNTDOWN_MS + 20);
    await game.type(SPACE);
    await game.run(20);
    const rows = visibleRows(game.app.lastFrame());
    expect(rows[18]).toBe(' . . . .[][] . . . .');
    expect(rows[19]).toBe(' . . . .[][] . . . .');
  });

  it('runs the clock: the time shows in the HUD', async () => {
    const game = await solo();
    await game.run(COUNTDOWN_MS + 2_000);
    expect(game.app.lastFrame()).toContain('0:02.000');
  });

  it.each([
    [79, 24],
    [80, 23],
  ])(
    'asks for a bigger terminal at %i×%i, and shows the game again at 80×24',
    async (columns, rows) => {
      const game = await solo();
      resize(game.app, columns, rows);
      await settle();
      expect(game.app.lastFrame()).toContain('Please enlarge the terminal');
      expect(game.app.lastFrame()).not.toContain('NEXT');
      resize(game.app, 80, 24);
      await settle();
      expect(game.app.lastFrame()).not.toContain('enlarge');
      expect(game.app.lastFrame()).toContain('NEXT');
    },
  );

  it('stops the game loop when it closes, so nothing is left running', async () => {
    const game = await solo();
    await game.run(COUNTDOWN_MS + 100);
    expect(game.clock.pending).toBe(1);
    game.app.unmount();
    expect(game.clock.pending).toBe(0);
  });
});

describe('shura solo marathon', () => {
  it('shows the level, lines and score, and hard drops score', async () => {
    const game = await solo('marathon');
    const hud = () => wallRows(game.app.lastFrame()).map(({ left }) => left.trim());
    expect(hud().slice(4, 12)).toEqual(['LEVEL', '1', '', 'LINES', '0/150', '', 'SCORE', '0']);
    await game.run(COUNTDOWN_MS + 20);
    await game.type(SPACE);
    await game.run(20);
    // The O hard drops 19 rows, 2 points a row.
    expect(hud().slice(10, 12)).toEqual(['SCORE', '38']);
  });
});

describe('shura solo ultra', () => {
  it('counts the 2 minutes down from Go', async () => {
    const game = await solo('ultra');
    expect(game.app.lastFrame()).toContain('2:00.000');
    await game.run(COUNTDOWN_MS + 2_000);
    expect(game.app.lastFrame()).toContain('1:58.000');
  });
});
