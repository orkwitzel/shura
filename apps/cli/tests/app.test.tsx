import { afterEach, describe, expect, it } from 'vitest';
import { resize, settle, visibleRows } from './support/ink';
import { COUNTDOWN_MS, KEYS, soloSprint } from './support/solo-app';

const RIGHT = KEYS.right;
const RIGHT_UP = KEYS.rightUp;
const SPACE = KEYS.space;

let app: Awaited<ReturnType<typeof soloSprint>>['app'] | undefined;
afterEach(() => app?.unmount());

/** `shura solo sprint` with seed 7 (O first, in columns 4–5) on a fake clock, at 80×24. */
async function sprint() {
  const game = await soloSprint();
  app = game.app;
  return game;
}

describe('shura solo sprint', () => {
  it('starts with the board, the queue and the precise status line', async () => {
    const { app } = await sprint();
    const frame = app.lastFrame() ?? '';
    expect(visibleRows(frame)).toHaveLength(20);
    expect(frame).toContain('NEXT');
    expect(frame).toContain('input: precise');
  });

  it('moves the piece with a Kitty-protocol press and release', async () => {
    const game = await sprint();
    await game.run(COUNTDOWN_MS + 20);
    await game.type(RIGHT);
    await game.run(20);
    await game.type(RIGHT_UP);
    await game.run(20);
    expect(visibleRows(game.app.lastFrame())[0]).toBe(' . . . . .[][] . . .');
  });

  it('hard-drops with Space', async () => {
    const game = await sprint();
    await game.run(COUNTDOWN_MS + 20);
    await game.type(SPACE);
    await game.run(20);
    const rows = visibleRows(game.app.lastFrame());
    expect(rows[18]).toBe(' . . . .[][] . . . .');
    expect(rows[19]).toBe(' . . . .[][] . . . .');
  });

  it('runs the clock: the time shows in the HUD', async () => {
    const game = await sprint();
    await game.run(COUNTDOWN_MS + 2_000);
    expect(game.app.lastFrame()).toContain('0:02.000');
  });

  it.each([
    [79, 24],
    [80, 23],
  ])(
    'asks for a bigger terminal at %i×%i, and shows the game again at 80×24',
    async (columns, rows) => {
      const game = await sprint();
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
    const game = await sprint();
    await game.run(COUNTDOWN_MS + 100);
    expect(game.clock.pending).toBe(1);
    game.app.unmount();
    expect(game.clock.pending).toBe(0);
  });
});
