import type { Bindings } from '@shura/client-core';
import { ActionType } from '@shura/engine';

/**
 * The web's default bindings (design §7.4, web column). A web key name is the key's
 * `KeyboardEvent.code`: the physical key, so a keyboard layout (Hebrew, AZERTY) doesn't move the
 * controls. The left and right Ctrl and Shift are separate keys, so both are bound.
 */
export const DEFAULT_BINDINGS: Bindings = {
  [ActionType.MoveLeft]: ['ArrowLeft'],
  [ActionType.MoveRight]: ['ArrowRight'],
  [ActionType.SoftDrop]: ['ArrowDown'],
  [ActionType.HardDrop]: ['Space'],
  [ActionType.RotateCW]: ['ArrowUp', 'KeyX'],
  [ActionType.RotateCCW]: ['KeyZ', 'ControlLeft', 'ControlRight'],
  [ActionType.Rotate180]: ['KeyA'],
  [ActionType.Hold]: ['KeyC', 'ShiftLeft', 'ShiftRight'],
};
