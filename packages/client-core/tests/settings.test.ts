import { ActionType } from '@shura/engine';
import { describe, expect, test } from 'vitest';
import {
  type BindingsOf,
  createSettingsStore,
  DEFAULT_HANDLING_SETTINGS,
  type HandlingSettings,
  handlingFrames,
  rebind,
  SETTINGS_VERSION,
  stepHandling,
  unbind,
} from '../src/index';
import { memoryStorage } from './support/memory-storage';

/** A platform's default bindings, as the CLI's or the web's would be. */
const BINDINGS: BindingsOf = {
  [ActionType.MoveLeft]: ['left'],
  [ActionType.MoveRight]: ['right'],
  [ActionType.SoftDrop]: ['down'],
  [ActionType.HardDrop]: ['space'],
  [ActionType.RotateCW]: ['up', 'x'],
  [ActionType.RotateCCW]: ['z'],
  [ActionType.Rotate180]: ['a'],
  [ActionType.Hold]: ['c'],
};

function load(stored?: unknown) {
  const storage = memoryStorage(stored === undefined ? {} : { settings: stored });
  return { storage, settings: createSettingsStore({ storage, bindings: BINDINGS }) };
}

describe('loading the settings', () => {
  test('with nothing saved yet gives the defaults, without a message', () => {
    const { settings } = load();
    expect(settings.problem).toBeNull();
    expect(settings.getState()).toEqual({
      version: SETTINGS_VERSION,
      handling: { das: 167, arr: 33, softDropFactor: 20 },
      bindings: BINDINGS,
      ghost: true,
      theme: 'shura-dark',
      skin: 'flat',
      volume: 50,
    });
  });

  test('keeps what was saved', () => {
    const { settings } = load({
      version: SETTINGS_VERSION,
      handling: { das: 100, arr: 0, softDropFactor: 'instant' },
      ghost: false,
      skin: 'bevelled',
      volume: 0,
      effects: 'reduced',
      nickname: 'or',
    });
    expect(settings.problem).toBeNull();
    expect(settings.getState()).toMatchObject({
      handling: { das: 100, arr: 0, softDropFactor: 'instant' },
      ghost: false,
      skin: 'bevelled',
      volume: 0,
      effects: 'reduced',
      nickname: 'or',
    });
  });

  test('fills in what a hand-edited file leaves out from the defaults', () => {
    const { settings } = load({
      version: SETTINGS_VERSION,
      handling: { das: 100 },
      bindings: { hold: ['v'] },
    });
    expect(settings.problem).toBeNull();
    expect(settings.getState().handling).toEqual({ das: 100, arr: 33, softDropFactor: 20 });
    expect(settings.getState().bindings).toEqual({ ...BINDINGS, hold: ['v'] });
  });

  test.each([
    ['DAS above its range', { handling: { das: 334 } }, 'handling.das'],
    ['ARR below its range', { handling: { arr: -1 } }, 'handling.arr'],
    ['a soft-drop factor below ×5', { handling: { softDropFactor: 4 } }, 'handling.softDropFactor'],
    ['a volume off its steps of 10', { volume: 55 }, 'volume'],
    ['an unknown skin', { skin: 'glossy' }, 'skin'],
    ['an unknown theme', { theme: 'neon' }, 'theme'],
    ['a key bound to two actions', { bindings: { hold: ['x'] } }, 'bindings'],
  ])('with %s falls back to the defaults, saying what is wrong', (_, change, field) => {
    const { settings } = load({ version: SETTINGS_VERSION, ...change });
    expect(settings.getState()).toEqual(load().settings.getState());
    expect(settings.problem).toContain('settings.json');
    expect(settings.problem).toContain(field);
    expect(settings.problem).toContain('using the defaults');
  });

  test.each([
    ['text that is not JSON', '{ "version": 1, '],
    ['no version', { ghost: false }],
    ['a version from a newer Shura', { version: SETTINGS_VERSION + 1 }],
  ])('with %s falls back to the defaults, with a message', (_, stored) => {
    const { settings } = load(stored);
    expect(settings.getState()).toEqual(load().settings.getState());
    expect(settings.problem).toMatch(/settings\.json.*using the defaults/);
  });

  test('that falls back leaves the file alone until settings are saved', () => {
    const { storage } = load('oops');
    expect(storage.texts.get('settings')).toBe('oops');
    expect(storage.asides.size).toBe(0);
  });
});

describe('saving the settings', () => {
  test('writes them where the next load finds them', () => {
    const { storage, settings } = load();
    settings.update({ ghost: false, skin: 'outlined' });
    expect(settings.save()).toBeNull();
    const again = createSettingsStore({ storage, bindings: BINDINGS });
    expect(again.problem).toBeNull();
    expect(again.getState()).toEqual(settings.getState());
    expect(again.getState()).toMatchObject({ ghost: false, skin: 'outlined' });
  });

  test('replaces a file that fell back to the defaults', () => {
    const { storage, settings } = load('oops');
    expect(settings.save()).toBeNull();
    expect(createSettingsStore({ storage, bindings: BINDINGS }).problem).toBeNull();
  });

  test('that fails says why, and keeps the settings in the store', () => {
    const { storage, settings } = load();
    settings.update({ volume: 70 });
    storage.failWrites = true;
    expect(settings.save()).toMatch(/settings\.json.*disk full/);
    expect(settings.getState().volume).toBe(70);
  });
});

describe('changing the settings', () => {
  test('notifies subscribers with the new settings', () => {
    const { settings } = load();
    const seen: boolean[] = [];
    settings.subscribe((state) => seen.push(state.ghost));
    settings.update({ ghost: false });
    expect(seen).toEqual([false]);
  });

  test('refuses settings outside the rules, leaving them as they were', () => {
    const { settings } = load();
    const before = settings.getState();
    expect(() => settings.update({ handling: { ...before.handling, das: 400 } })).toThrow(
      RangeError,
    );
    expect(() => settings.update({ bindings: { ...BINDINGS, hold: ['space'] } })).toThrow(
      RangeError,
    );
    expect(settings.getState()).toBe(before);
  });
});

describe('handling', () => {
  test('is counted by the input engine in frames, rounded', () => {
    expect(handlingFrames(DEFAULT_HANDLING_SETTINGS)).toEqual({
      das: 10,
      arr: 2,
      softDropFactor: 20,
    });
    expect(handlingFrames({ das: 333, arr: 0, softDropFactor: 'instant' })).toEqual({
      das: 20,
      arr: 0,
      softDropFactor: 'instant',
    });
  });

  test.each([
    ['das', 1, 183],
    ['das', -1, 150],
    ['arr', 1, 50],
    ['arr', -1, 17],
  ] as const)('steps %s a frame at a time (%i)', (field, direction, ms) => {
    expect(stepHandling(DEFAULT_HANDLING_SETTINGS, field, direction)[field]).toBe(ms);
  });

  test.each([
    ['DAS', { das: 333 }, 'das', 1, 333],
    ['DAS', { das: 0 }, 'das', -1, 0],
    ['ARR', { arr: 83 }, 'arr', 1, 83],
    ['ARR', { arr: 0 }, 'arr', -1, 0],
  ] as const)('keeps %s within its range', (_, change, field, direction, ms) => {
    const handling = { ...DEFAULT_HANDLING_SETTINGS, ...change };
    expect(stepHandling(handling, field, direction)[field]).toBe(ms);
  });

  test('steps the soft-drop factor by 5 from ×5 to ×40, then instant', () => {
    let handling: HandlingSettings = { ...DEFAULT_HANDLING_SETTINGS, softDropFactor: 5 };
    const factors = [];
    for (let step = 0; step < 9; step++) {
      handling = stepHandling(handling, 'softDropFactor', 1);
      factors.push(handling.softDropFactor);
    }
    expect(factors).toEqual([10, 15, 20, 25, 30, 35, 40, 'instant', 'instant']);
    expect(stepHandling(handling, 'softDropFactor', -1).softDropFactor).toBe(40);
    const slowest = { ...DEFAULT_HANDLING_SETTINGS, softDropFactor: 5 };
    expect(stepHandling(slowest, 'softDropFactor', -1).softDropFactor).toBe(5);
  });

  test('steps a hand-edited soft-drop factor to the next step its way', () => {
    const handling = { ...DEFAULT_HANDLING_SETTINGS, softDropFactor: 12 };
    expect(stepHandling(handling, 'softDropFactor', 1).softDropFactor).toBe(15);
    expect(stepHandling(handling, 'softDropFactor', -1).softDropFactor).toBe(10);
  });
});

describe('rebinding', () => {
  test('puts the key in the slot', () => {
    expect(rebind(BINDINGS, ActionType.Hold, 0, 'v').hold).toEqual(['v']);
  });

  test('adds a key in the slot after the last', () => {
    expect(rebind(BINDINGS, ActionType.Hold, 1, 'v').hold).toEqual(['c', 'v']);
  });

  test('swaps a key already in use with the one it replaces', () => {
    const bindings = rebind(BINDINGS, ActionType.Hold, 0, 'z');
    expect(bindings.hold).toEqual(['z']);
    expect(bindings.rotateCCW).toEqual(['c']);
  });

  test('swaps into the other slot of a key that has two', () => {
    const bindings = rebind(BINDINGS, ActionType.Hold, 0, 'x');
    expect(bindings.hold).toEqual(['x']);
    expect(bindings.rotateCW).toEqual(['up', 'c']);
  });

  test('takes a key in use for a new slot away from the action that had it', () => {
    const bindings = rebind(BINDINGS, ActionType.Hold, 1, 'x');
    expect(bindings.hold).toEqual(['c', 'x']);
    expect(bindings.rotateCW).toEqual(['up']);
  });

  test("swaps an action's own keys", () => {
    expect(rebind(BINDINGS, ActionType.RotateCW, 0, 'x').rotateCW).toEqual(['x', 'up']);
    expect(rebind(BINDINGS, ActionType.RotateCW, 2, 'up').rotateCW).toEqual(['x', 'up']);
  });

  test('leaves the bindings it was given unchanged', () => {
    rebind(BINDINGS, ActionType.Hold, 0, 'z');
    expect(BINDINGS.hold).toEqual(['c']);
    expect(BINDINGS.rotateCCW).toEqual(['z']);
  });

  test('can unbind a slot', () => {
    expect(unbind(BINDINGS, ActionType.RotateCW, 0).rotateCW).toEqual(['x']);
  });

  test('gives bindings the settings accept', () => {
    const { settings } = load();
    settings.update({
      bindings: rebind(settings.getState().bindings, ActionType.Hold, 0, 'space'),
    });
    expect(settings.getState().bindings.hardDrop).toEqual(['c']);
  });
});
