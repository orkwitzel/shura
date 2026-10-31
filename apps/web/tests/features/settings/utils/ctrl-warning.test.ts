import { rebind } from '@shura/client-core';
import { ActionType } from '@shura/engine';
import { describe, expect, test } from 'vitest';
import { DEFAULT_BINDINGS } from '@/config/default-bindings';
import { ctrlWarning } from '@/features/settings/utils/ctrl-warning';

describe('ctrlWarning', () => {
  test('says nothing for the default bindings', () => {
    expect(ctrlWarning(DEFAULT_BINDINGS)).toBeNull();
  });

  test.each([
    ['KeyW', 'Ctrl+W'],
    ['KeyT', 'Ctrl+T'],
    ['KeyN', 'Ctrl+N'],
  ])('warns when %s is bound while Ctrl is', (key, shortcut) => {
    const bindings = rebind(DEFAULT_BINDINGS, ActionType.Rotate180, 0, key);
    expect(ctrlWarning(bindings)).toBe(
      `Browsers don't let a page block ${shortcut}, so pressing it while playing can close or open a tab or window.`,
    );
  });

  test('names each shortcut at risk', () => {
    let bindings = rebind(DEFAULT_BINDINGS, ActionType.Rotate180, 0, 'KeyW');
    bindings = rebind(bindings, ActionType.Hold, 0, 'KeyN');
    expect(ctrlWarning(bindings)).toMatch(/block Ctrl\+W or Ctrl\+N,/);
    bindings = rebind(bindings, ActionType.HardDrop, 0, 'KeyT');
    expect(ctrlWarning(bindings)).toMatch(/block Ctrl\+W, Ctrl\+T or Ctrl\+N,/);
  });

  test('says nothing once no Ctrl is bound', () => {
    let bindings = rebind(DEFAULT_BINDINGS, ActionType.Rotate180, 0, 'KeyW');
    bindings = { ...bindings, [ActionType.RotateCCW]: ['KeyZ'] };
    expect(ctrlWarning(bindings)).toBeNull();
  });

  test('warns with only one Ctrl bound', () => {
    let bindings = rebind(DEFAULT_BINDINGS, ActionType.Rotate180, 0, 'KeyT');
    bindings = { ...bindings, [ActionType.RotateCCW]: ['ControlRight'] };
    expect(ctrlWarning(bindings)).not.toBeNull();
  });
});
