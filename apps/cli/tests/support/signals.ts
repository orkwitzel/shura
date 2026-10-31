import type { KeyEvent } from '@shura/client-core';
import type { PieceActionType } from '@shura/engine';
import type { InputSignal } from '../../src/platform/input/input-adapter';

/** A key event signal, as an adapter makes it: `action` doing `kind` at `time` (ms). */
export function keySignal(
  action: PieceActionType,
  kind: KeyEvent['kind'],
  time: number,
): InputSignal {
  return { kind: 'key', event: { action, kind, time } };
}
