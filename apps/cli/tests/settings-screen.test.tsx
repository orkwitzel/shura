import { readFileSync } from 'node:fs';
import { ClientCoreProvider } from '@shura/client-core/react';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openStores } from '../src/config/stores';
import { SettingsScreen } from '../src/ui/settings-screen';
import { fakeClock } from './support/fake-clock';
import { resize, settle } from './support/ink';
import { SETTINGS_KEYS, settingsRow } from './support/settings';
import { tempStorage } from './support/temp-storage';

const KEY = SETTINGS_KEYS;

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
});

/**
 * The settings screen over config.json in a temporary XDG directory (one it can't write to, if
 * `unwritable`), at 80×24.
 */
async function settingsScreen(config?: unknown, { unwritable = false, clock = fakeClock() } = {}) {
  const temp = tempStorage(config === undefined ? {} : { config });
  const stores = openStores(
    unwritable
      ? {
          ...temp.storage,
          write: () => {
            throw new Error('disk full');
          },
        }
      : temp.storage,
  );
  const onClose = vi.fn();
  const app = render(
    <ClientCoreProvider settings={stores.settings} records={stores.records}>
      <SettingsScreen onClose={onClose} clock={clock} />
    </ClientCoreProvider>,
  );
  cleanups.push(() => app.unmount(), temp.cleanup);
  resize(app, 80, 24);
  await settle();
  return {
    stores,
    onClose,
    frame: () => app.lastFrame() ?? '',
    /**
     * The row labelled `label`, as `[› ]<label> <value>`: the cursor if it's on the row, then the
     * label, then the value with its spaces squeezed.
     */
    line: (label: string) => settingsRow(app.lastFrame() ?? '', label),
    saved: () => JSON.parse(readFileSync(temp.paths.settings, 'utf8')),
    async type(...keys: string[]) {
      for (const key of keys) {
        app.stdin.write(key);
        await settle();
      }
    },
  };
}

describe('the settings screen', () => {
  it('shows the handling in ms and frames, and the soft-drop factor', async () => {
    const screen = await settingsScreen();
    expect(screen.frame()).toContain('SETTINGS');
    expect(screen.line('DAS')).toBe('› DAS < 167 ms (10 frames) >');
    expect(screen.line('ARR')).toBe('ARR < 33 ms (2 frames) >');
    expect(screen.line('Soft drop factor')).toBe('Soft drop factor < ×20 >');
  });

  it('says why a change could not be saved, keeping it for this run', async () => {
    const screen = await settingsScreen(undefined, { unwritable: true });
    await screen.type(KEY.right);
    const text = screen.frame().replace(/\s+/g, ' ');
    expect(text).toContain("Couldn't save");
    expect(text).toContain('disk full');
    expect(screen.line('DAS')).toBe('› DAS < 183 ms (11 frames) >');
  });

  it('lists the keys it takes where the cursor is', async () => {
    const screen = await settingsScreen();
    expect(screen.frame()).toContain('↑↓ choose  ←→ change  Esc back');
    await screen.type(...Array<string>(3).fill(KEY.down));
    expect(screen.frame()).toContain('←→ slot  Enter rebind  Backspace clear  Esc back');
  });

  it('steps DAS a frame at a time with ← and →, and saves it', async () => {
    const screen = await settingsScreen();
    await screen.type(KEY.right);
    expect(screen.line('DAS')).toBe('› DAS < 183 ms (11 frames) >');
    await screen.type(KEY.left, KEY.left);
    expect(screen.line('DAS')).toBe('› DAS < 150 ms (9 frames) >');
    expect(screen.saved().handling.das).toBe(150);
  });

  it('stops the steppers at the ends of their ranges, and shows no arrow past them', async () => {
    const screen = await settingsScreen({
      version: 1,
      handling: { das: 317, arr: 17, softDropFactor: 35 },
    });
    await screen.type(KEY.right, KEY.right, KEY.right);
    expect(screen.line('DAS')).toBe('› DAS < 333 ms (20 frames)');
    await screen.type(KEY.down, KEY.left, KEY.left, KEY.left);
    expect(screen.line('ARR')).toBe('› ARR 0 ms (0 frames) >');
    await screen.type(KEY.down, KEY.right, KEY.right, KEY.right);
    expect(screen.line('Soft drop factor')).toBe('› Soft drop factor < instant');
    expect(screen.saved().handling).toEqual({ das: 333, arr: 0, softDropFactor: 'instant' });
  });

  it('stops the soft-drop factor at ×5 and ARR at 83 ms', async () => {
    const screen = await settingsScreen({ version: 1, handling: { arr: 67, softDropFactor: 10 } });
    await screen.type(KEY.down, KEY.right, KEY.right, KEY.right);
    expect(screen.line('ARR')).toBe('› ARR < 83 ms (5 frames)');
    await screen.type(KEY.down, KEY.left, KEY.left);
    expect(screen.line('Soft drop factor')).toBe('› Soft drop factor ×5 >');
  });

  it('lists each game control with its keys', async () => {
    const screen = await settingsScreen();
    expect(screen.line('Move left')).toBe('Move left ←');
    expect(screen.line('Move right')).toBe('Move right →');
    expect(screen.line('Soft drop')).toBe('Soft drop ↓');
    expect(screen.line('Hard drop')).toBe('Hard drop Space');
    expect(screen.line('Rotate CW')).toBe('Rotate CW ↑ X');
    expect(screen.line('Rotate CCW')).toBe('Rotate CCW Z');
    expect(screen.line('Rotate 180°')).toBe('Rotate 180° A');
    expect(screen.line('Hold')).toBe('Hold C');
  });
});

/** Moves the cursor down `rows` rows from the top. */
const down = (rows: number) => Array<string>(rows).fill(KEY.down);

/** Rows from the top to each game control. */
const TO = { moveLeft: 3, rotateCW: 7, hold: 10 };

describe('rebinding', () => {
  it('binds the key pressed, swapping with the control that had it, and saves', async () => {
    const screen = await settingsScreen();
    await screen.type(...down(TO.hold));
    expect(screen.line('Hold')).toBe('› Hold [C] +');
    await screen.type(KEY.enter);
    expect(screen.line('Hold')).toBe('› Hold [...] +');
    expect(screen.frame()).toContain('Press a key for Hold (Esc cancels)');
    await screen.type(KEY.letter('x'));
    expect(screen.line('Hold')).toBe('› Hold [X] +');
    expect(screen.line('Rotate CW')).toBe('Rotate CW ↑ C');
    expect(screen.frame()).toContain('Rotate CW gets C');
    expect(screen.saved().bindings).toMatchObject({ hold: ['x'], rotateCW: ['up', 'c'] });
  });

  it('adds a key in the slot after the last, taking it from the control that had it', async () => {
    const screen = await settingsScreen();
    await screen.type(...down(TO.moveLeft), KEY.right, KEY.enter, KEY.letter('z'));
    expect(screen.line('Move left')).toBe('› Move left ← [Z] +');
    expect(screen.line('Rotate CCW')).toBe('Rotate CCW (none)');
    expect(screen.frame()).toContain('Rotate CCW loses Z');
    expect(screen.saved().bindings).toMatchObject({ moveLeft: ['left', 'z'], rotateCCW: [] });
  });

  it('removes the key in a slot with Backspace', async () => {
    const screen = await settingsScreen();
    await screen.type(...down(TO.rotateCW), KEY.right, KEY.backspace);
    expect(screen.line('Rotate CW')).toBe('› Rotate CW ↑ [+]');
    expect(screen.saved().bindings.rotateCW).toEqual(['up']);
  });

  it('cancels the prompt with Esc, changing nothing, and Esc again leaves', async () => {
    const screen = await settingsScreen();
    await screen.type(...down(TO.hold), KEY.enter, KEY.escape);
    expect(screen.line('Hold')).toBe('› Hold [C] +');
    expect(screen.onClose).not.toHaveBeenCalled();
    await screen.type(KEY.escape);
    expect(screen.onClose).toHaveBeenCalledOnce();
  });

  it("doesn't bind the key repeat of the Enter that opened the prompt, without Kitty releases", async () => {
    const clock = fakeClock();
    const screen = await settingsScreen(undefined, { clock });
    // A legacy terminal sends Enter as \r, and a held Enter as more of them: the OS key repeat.
    await screen.type(...down(TO.hold), '\r');
    for (const gap of [500, 33, 33]) {
      clock.run(gap, gap);
      await screen.type('\r');
      expect(screen.line('Hold')).toBe('› Hold [...] +');
    }
    // Let go, then pressed again: now it binds.
    clock.run(1_000, 1_000);
    await screen.type('\r');
    expect(screen.line('Hold')).toBe('› Hold [Enter] +');
  });

  it.each([
    ['P, the menu key', KEY.letter('p'), 'P opens the menu'],
    ['a key with Ctrl', '\x1b[120;5u', "can't report"],
    ['Tab', '\x1b[9u', "can't report"],
    ['a key with Shift', '\x1b[120;2u', 'Shift+X reads as X'],
  ])('refuses %s with a message, and waits for another key', async (_, bytes, why) => {
    const screen = await settingsScreen();
    await screen.type(...down(TO.hold), KEY.enter, bytes);
    expect(screen.frame()).toContain(why);
    expect(screen.line('Hold')).toBe('› Hold [...] +');
    expect(screen.stores.settings.getState().bindings.hold).toEqual(['c']);
    await screen.type(KEY.letter('v'));
    expect(screen.line('Hold')).toBe('› Hold [V] +');
  });
});

describe('the display rows', () => {
  it('toggle the ghost with ← or →, and save it', async () => {
    const screen = await settingsScreen();
    await screen.type(...down(11));
    expect(screen.line('Ghost')).toBe('› Ghost < on >');
    await screen.type(KEY.right);
    expect(screen.line('Ghost')).toBe('› Ghost < off >');
    expect(screen.saved().ghost).toBe(false);
    await screen.type(KEY.left);
    expect(screen.line('Ghost')).toBe('› Ghost < on >');
  });

  it('pick the theme and save it', async () => {
    const screen = await settingsScreen();
    await screen.type(...down(12));
    expect(screen.line('Theme')).toBe('› Theme Indigo >');
    await screen.type(KEY.right);
    expect(screen.line('Theme')).toBe('› Theme < Plum >');
    await screen.type(KEY.right);
    expect(screen.line('Theme')).toBe('› Theme < Deep Sea');
    expect(screen.saved().theme).toBe('deep-sea');
  });

  it('pick the skin, each shown with its cell, and save it', async () => {
    const screen = await settingsScreen();
    await screen.type(...down(13));
    expect(screen.line('Skin')).toBe('› Skin Pixel ██ >');
    await screen.type(KEY.right);
    expect(screen.line('Skin')).toBe('› Skin < Flat ▓▓ >');
    await screen.type(KEY.right, KEY.right);
    expect(screen.line('Skin')).toBe('› Skin < Outline []');
    expect(screen.saved().skin).toBe('outline');
  });

  it('stop the cursor at the last row', async () => {
    const screen = await settingsScreen();
    await screen.type(...down(20));
    expect(screen.line('Skin')).toMatch(/^› Skin/);
  });
});
