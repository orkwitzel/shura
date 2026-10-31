import { ActionType } from '@shura/engine';
import { describe, expect, test } from 'vitest';
import { DEFAULT_BINDINGS } from '@/config/default-bindings';
import { createWebAdapter, type RawKey } from '@/lib/keyboard/web-adapter';

const adapt = createWebAdapter(DEFAULT_BINDINGS);

const down = (code: string, time: number, repeat = false): RawKey => ({
  type: 'keydown',
  code,
  repeat,
  time,
});
const up = (code: string, time: number): RawKey => ({ type: 'keyup', code, repeat: false, time });

describe('the web adapter', () => {
  test('a keydown of a bound key is a press of its action, at its time', () => {
    expect(adapt(down('ArrowLeft', 100))).toEqual({
      event: { action: ActionType.MoveLeft, kind: 'press', time: 100 },
      preventDefault: true,
    });
  });

  test('a keyup of a bound key is a release of its action, at its time', () => {
    expect(adapt(up('ArrowLeft', 250))).toEqual({
      event: { action: ActionType.MoveLeft, kind: 'release', time: 250 },
      preventDefault: true,
    });
  });

  test('the default bindings follow the web column of design §7.4', () => {
    const action = (code: string) => adapt(down(code, 0)).event?.action;
    expect(action('ArrowRight')).toBe(ActionType.MoveRight);
    expect(action('ArrowDown')).toBe(ActionType.SoftDrop);
    expect(action('Space')).toBe(ActionType.HardDrop);
    expect(action('ArrowUp')).toBe(ActionType.RotateCW);
    expect(action('KeyX')).toBe(ActionType.RotateCW);
    expect(action('KeyZ')).toBe(ActionType.RotateCCW);
    expect(action('ControlLeft')).toBe(ActionType.RotateCCW);
    expect(action('ControlRight')).toBe(ActionType.RotateCCW);
    expect(action('KeyA')).toBe(ActionType.Rotate180);
    expect(action('KeyC')).toBe(ActionType.Hold);
    expect(action('ShiftLeft')).toBe(ActionType.Hold);
    expect(action('ShiftRight')).toBe(ActionType.Hold);
  });

  test("the browser's key repeat is ignored, but still kept from scrolling the page", () => {
    expect(adapt(down('ArrowDown', 600, true))).toEqual({ event: null, preventDefault: true });
    expect(adapt(down('Space', 600, true))).toEqual({ event: null, preventDefault: true });
  });

  test('unbound keys make nothing and keep their default', () => {
    expect(adapt(down('KeyQ', 0))).toEqual({ event: null, preventDefault: false });
    expect(adapt(up('KeyQ', 0))).toEqual({ event: null, preventDefault: false });
    expect(adapt(down('Tab', 0))).toEqual({ event: null, preventDefault: false });
    expect(adapt(down('F5', 0, true))).toEqual({ event: null, preventDefault: false });
  });

  test('follows the bindings it is given', () => {
    const rebound = createWebAdapter({
      ...DEFAULT_BINDINGS,
      [ActionType.HardDrop]: ['KeyW'],
    });
    expect(rebound(down('KeyW', 5)).event).toEqual({
      action: ActionType.HardDrop,
      kind: 'press',
      time: 5,
    });
    expect(rebound(down('Space', 5))).toEqual({ event: null, preventDefault: false });
  });
});
