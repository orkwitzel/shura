import { afterEach, describe, expect, it } from 'vitest';
import { visibleRows } from './support/ink';
import { COUNTDOWN_MS, KEYS, soloGame } from './support/solo-app';

type Game = Awaited<ReturnType<typeof soloGame>>;

let game: Game | undefined;
afterEach(() => game?.app.unmount());

async function start(): Promise<Game> {
  game = await soloGame();
  return game;
}

/** The text drawn over the board: its rows that hold no cells, trimmed. */
function overBoard(frame: string): string[] {
  return visibleRows(frame)
    .map((row) => row.trim())
    .filter((row) => row !== '' && !row.startsWith('.') && !row.includes(' .'));
}

describe('the countdown', () => {
  it('shows 3, 2, 1 over the board, 0.5 s each, then Go for 0.5 s', async () => {
    const game = await start();
    expect(overBoard(game.frame())).toEqual(['3']);
    await game.run(500);
    expect(overBoard(game.frame())).toEqual(['2']);
    await game.run(500);
    expect(overBoard(game.frame())).toEqual(['1']);
    await game.run(500);
    expect(overBoard(game.frame())).toEqual(['GO']);
    await game.run(500);
    expect(overBoard(game.frame())).toEqual([]);
  });

  it('leaves the board rows it covers to the board around them', async () => {
    const game = await start();
    const rows = visibleRows(game.frame());
    expect(rows).toHaveLength(20);
    expect(rows[0]).toBe(' . . . .[][] . . . .');
  });
});

/** The HUD's time. */
function time(frame: string): string | undefined {
  return frame.match(/\d:\d\d\.\d{3}/)?.[0];
}

/** Seed 7's O at the right wall, in the top visible row. */
const AT_RIGHT_WALL = ' . . . . . . . .[][]';

describe('the in-game menu', () => {
  it.each([
    ['Esc', KEYS.escape],
    ['P', KEYS.letter('p')],
  ])('opens with %s, over the board, and stops the game', async (_, key) => {
    const game = await start();
    await game.run(COUNTDOWN_MS + 1_000);
    await game.type(key);
    expect(overBoard(game.frame())).toEqual([
      'PAUSED',
      'Esc  Resume',
      'R    Restart',
      'Q    Quit to menu',
    ]);
    const paused = time(game.frame());
    await game.run(2_000);
    expect(time(game.frame())).toBe(paused);
  });

  it.each(['r', 's', 'q'])(
    'is the only thing outside the game controls: %s does nothing',
    async (letter) => {
      const game = await start();
      await game.run(COUNTDOWN_MS + 1_000);
      await game.type(KEYS.letter(letter));
      await game.run(1_000);
      expect(overBoard(game.frame())).toEqual([]);
      expect(time(game.frame())).toBe('0:02.000');
      expect(game.clock.pending).toBe(1);
    },
  );

  it.each([
    ['Esc', KEYS.escape],
    ['Enter', KEYS.enter],
  ])('resumes with %s, through the countdown, from the same time', async (_, key) => {
    const game = await start();
    await game.run(COUNTDOWN_MS + 1_000);
    await game.type(KEYS.escape);
    await game.run(5_000);
    await game.type(key);
    expect(overBoard(game.frame())).toEqual(['3']);
    expect(time(game.frame())).toBe('0:01.000');
    await game.run(COUNTDOWN_MS + 500);
    expect(time(game.frame())).toBe('0:01.500');
  });

  it('charges a direction pressed in the menu through the countdown', async () => {
    const game = await start();
    await game.run(COUNTDOWN_MS + 1_000);
    await game.type(KEYS.escape);
    await game.type(KEYS.right);
    await game.type(KEYS.escape);
    // Charged at Go, it moves every 2 frames from the first frame played: 4 moves in 8 frames.
    await game.run(COUNTDOWN_MS + 150);
    expect(visibleRows(game.frame())[0]).toBe(AT_RIGHT_WALL);
  });

  it('restarts with R: a new game, through the countdown, with a held direction charged', async () => {
    const game = await start();
    await game.run(COUNTDOWN_MS + 1_000);
    await game.type(KEYS.space);
    await game.run(100);
    await game.type(KEYS.escape);
    await game.type(KEYS.right);
    await game.type(KEYS.letter('r'));
    expect(overBoard(game.frame())).toEqual(['3']);
    expect(time(game.frame())).toBe('0:00.000');
    // The piece dropped before the restart is gone: only the new O is on the board.
    expect(visibleRows(game.frame()).slice(1).join('')).not.toContain('[]');
    await game.run(COUNTDOWN_MS + 150);
    expect(visibleRows(game.frame())[0]).toBe(AT_RIGHT_WALL);
    expect(game.clock.pending).toBe(1);
  });

  it('quits with Q (to the main menu, once there is one)', async () => {
    const game = await start();
    await game.run(COUNTDOWN_MS + 1_000);
    await game.type(KEYS.escape);
    await game.type(KEYS.letter('q'));
    expect(game.frame()).toBe('');
    expect(game.clock.pending).toBe(0);
  });

  it('opens by itself after a stall', async () => {
    const game = await start();
    await game.run(COUNTDOWN_MS + 1_000);
    await game.run(1_000, 1_000);
    expect(overBoard(game.frame())).toContain('PAUSED');
  });
});

describe('the in-game menu in a terminal without the Kitty protocol (basic input)', () => {
  it('opens with P, restarts with R and resumes with Enter, as plain bytes', async () => {
    const game = await start();
    await game.run(COUNTDOWN_MS + 1_000);
    await game.type('p');
    expect(game.frame()).toContain('input: basic');
    expect(overBoard(game.frame())).toContain('PAUSED');
    await game.type('r');
    expect(overBoard(game.frame())).toEqual(['3']);
    expect(time(game.frame())).toBe('0:00.000');
    await game.run(COUNTDOWN_MS + 500);
    await game.type('p');
    await game.type('\r');
    expect(overBoard(game.frame())).toEqual(['3']);
    expect(time(game.frame())).toBe('0:00.500');
  });
});

describe('a terminal shrinking below 80×24 mid-game', () => {
  it('pauses the game behind the enlarge message, and the menu is back once it is big enough', async () => {
    const game = await start();
    await game.run(COUNTDOWN_MS + 1_000);
    await game.resize(79, 24);
    expect(game.frame()).toContain('Please enlarge the terminal');
    await game.run(2_000);
    await game.resize(80, 24);
    expect(overBoard(game.frame())).toContain('PAUSED');
    expect(time(game.frame())).toBe('0:01.000');
  });

  it("ignores the menu's keys while the game can't be seen", async () => {
    const game = await start();
    await game.run(COUNTDOWN_MS + 1_000);
    await game.resize(80, 23);
    await game.type(KEYS.escape);
    await game.run(2_000);
    await game.resize(80, 24);
    expect(overBoard(game.frame())).toContain('PAUSED');
    expect(time(game.frame())).toBe('0:01.000');
  });
});

describe('the results', () => {
  /** Hard drops in one column, until the stack tops out. */
  async function topOut(game: Game) {
    await game.run(COUNTDOWN_MS + 100);
    for (let i = 0; i < 30 && game.clock.pending > 0; i++) {
      await game.type(KEYS.space);
      await game.run(20);
    }
  }

  it('replace the game once it ends, with Game over after a top-out', async () => {
    const game = await start();
    await topOut(game);
    const frame = game.frame();
    expect(frame).toContain('GAME OVER');
    expect(frame).toMatch(/PIECES\s+\d+/);
    expect(frame).toContain('R  Play again');
    expect(visibleRows(frame)).toEqual([]);
  });

  it.each(['s', 'q', 'p'])('ignore %s', async (letter) => {
    const game = await start();
    await topOut(game);
    await game.type(KEYS.letter(letter));
    expect(game.frame()).toContain('GAME OVER');
  });

  it('play again with R, through the countdown', async () => {
    const game = await start();
    await topOut(game);
    await game.type(KEYS.letter('r'));
    expect(overBoard(game.frame())).toEqual(['3']);
    await game.run(COUNTDOWN_MS + 1_000);
    expect(time(game.frame())).toBe('0:01.000');
  });

  it.each([
    ['Enter', KEYS.enter],
    ['Esc', KEYS.escape],
  ])('go back with %s', async (_, key) => {
    const game = await start();
    await topOut(game);
    await game.type(key);
    // There is no main menu yet, so going back quits: the app exits and its output is cleared.
    expect(game.frame()).toBe('');
  });
});
