import { afterEach, describe, expect, it } from 'vitest';
import type { InputOptions } from '../src/ui/use-terminal-input';
import { visibleRows } from './support/ink';
import { SETTINGS_KEYS, settingsRow } from './support/settings';
import { COUNTDOWN_MS, KEYS, soloGame } from './support/solo-app';

type Game = Awaited<ReturnType<typeof soloGame>>;

let game: Game | undefined;
afterEach(() => game?.app.unmount());

/** A Sprint (seed 7: O first, in columns 4–5) a second into play, with its menu open. */
async function inMenu(input?: InputOptions): Promise<Game> {
  game = await soloGame('sprint', input);
  await game.run(COUNTDOWN_MS + 1_000);
  await game.type(KEYS.escape);
  return game;
}

/** Types each key in turn. */
async function type(game: Game, ...keys: string[]): Promise<void> {
  for (const key of keys) await game.type(key);
}

const { down, left } = SETTINGS_KEYS;
const times = (count: number, key: string) => Array<string>(count).fill(key);

/** The top visible row: where seed 7's O is. */
const top = (game: Game) => visibleRows(game.frame())[0];
const START = ' . . . .[][] . . . .';
const ONE_RIGHT = ' . . . . .[][] . . .';
const AT_RIGHT_WALL = ' . . . . . . . .[][]';
/** The board rows with cells or the ghost on them, with their row numbers. */
const pieces = (game: Game) =>
  visibleRows(game.frame()).flatMap((row, at) => (/\[\]|::/.test(row) ? [`${at}${row}`] : []));

describe('settings from the in-game menu', () => {
  it('are an entry of the menu, between Restart and Quit', async () => {
    const game = await inMenu();
    expect(game.frame()).toMatch(
      /Restart +R[^\n]*\n[^\n]*Settings +S[^\n]*\n[^\n]*Quit to menu +Q/,
    );
  });

  it('open with S in place of the game, and Esc goes back to the menu, still paused', async () => {
    const game = await inMenu();
    await game.type(KEYS.letter('s'));
    expect(game.frame()).toContain('SETTINGS');
    expect(visibleRows(game.frame())).toEqual([]);
    await game.type(KEYS.escape);
    expect(game.frame()).not.toContain('SETTINGS');
    expect(game.frame()).toContain('PAUSED');
    await game.run(1_000);
    expect(game.frame()).toContain('PAUSED');
  });

  it('apply handling changes when the game resumes', async () => {
    const game = await inMenu({ choice: 'precise' });
    await game.type(KEYS.letter('s'));
    // DAS from 10 frames to 0, then ARR from 2 frames to 0.
    await type(game, ...times(10, left), down, left, left);
    expect(settingsRow(game.frame(), 'DAS')).toBe('DAS 0 ms (0 frames) >');
    await type(game, KEYS.escape, KEYS.escape);
    await game.run(COUNTDOWN_MS + 20);
    await game.type(KEYS.right);
    await game.run(20);
    expect(top(game)).toBe(AT_RIGHT_WALL);
  });

  it('apply a rebind when the game resumes, keeping the adapter chosen', async () => {
    game = await soloGame('sprint');
    await game.run(COUNTDOWN_MS + 1_000);
    // A key only the Kitty protocol sends: the auto adapter chooses precise.
    await type(game, KEYS.letter('z'), KEYS.letter('z').replace('u', ';1:3u'));
    expect(game.frame()).toContain('input: precise');
    await type(game, KEYS.escape, KEYS.letter('s'));
    // Move right (the fifth row) bound to D instead of →.
    await type(game, ...times(4, down), KEYS.enter, KEYS.letter('d'));
    expect(settingsRow(game.frame(), 'Move right')).toBe('› Move right [D] +');
    await type(game, KEYS.escape, KEYS.escape);
    await game.run(COUNTDOWN_MS + 20);
    expect(game.frame()).toContain('input: precise');
    const before = top(game);
    await game.type(KEYS.right);
    await game.run(20);
    expect(top(game)).toBe(before);
    await type(game, KEYS.letter('d'), KEYS.letter('d').replace('u', ';1:3u'));
    await game.run(20);
    expect(top(game)).not.toBe(before);
    expect(game.frame()).toContain('input: precise');
    expect(game.stores.settings.getState().bindings.moveRight).toEqual(['d']);
  });

  it('take every key while open: none reaches the game', async () => {
    const game = await inMenu({ choice: 'precise' });
    const before = pieces(game);
    await game.type(KEYS.letter('s'));
    // On a binding row, Space, X and R (Restart, in the menu) are just keys.
    await type(game, ...times(3, down), KEYS.space, KEYS.letter('x'), KEYS.letter('r'));
    await type(game, KEYS.escape, KEYS.escape);
    await game.run(COUNTDOWN_MS);
    expect(pieces(game)).toEqual(before);
    expect(game.frame()).toContain('0:01.000');
  });

  it("don't leave a key held that was let go while they were open", async () => {
    game = await soloGame('sprint', { choice: 'precise' });
    await game.run(COUNTDOWN_MS + 20);
    await game.type(KEYS.right);
    await game.run(20);
    expect(top(game)).toBe(ONE_RIGHT);
    // Held into the menu and the settings, then let go there.
    await type(game, KEYS.escape, KEYS.letter('s'), KEYS.rightUp, KEYS.escape, KEYS.escape);
    await game.run(COUNTDOWN_MS + 1_000);
    expect(top(game)).toBe(ONE_RIGHT);
    expect(START).not.toBe(ONE_RIGHT);
  });

  it('take no keys while the terminal is too small to show them', async () => {
    const game = await inMenu();
    await game.type(KEYS.letter('s'));
    await game.resize(60, 20);
    await type(game, SETTINGS_KEYS.right, KEYS.escape);
    await game.resize(80, 24);
    expect(settingsRow(game.frame(), 'DAS')).toBe('› DAS < 167 ms (10 frames) >');
  });
});
