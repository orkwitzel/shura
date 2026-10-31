import { ActionType } from '@shura/engine';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../../../src/platform/input/bindings';
import { createPreciseAdapter } from '../../../src/platform/input/precise-adapter';
import type { InputSignal } from '../../../src/platform/input/terminal-input';
import { parseTerminalBytes } from '../../support/terminal-bytes';

const { MoveLeft, MoveRight, SoftDrop, HardDrop, RotateCW, RotateCCW, Rotate180, Hold } =
  ActionType;

/**
 * Kitty keyboard protocol sequences, built from the protocol spec
 * (https://sw.kovidgoyal.net/kitty/keyboard-protocol/) with the flags the CLI asks for:
 * disambiguate escape codes, report event types and report all keys as escape codes. A press with
 * no modifiers leaves out the modifier and event-type fields; repeat is event type 2, release 3.
 * Arrows are `CSI 1 ; mods:type {A,B,C,D}`, other keys `CSI codepoint ; mods:type u`.
 */
const CSI = '\x1b[';
const arrow = (letter: string, type = 1) =>
  type === 1 ? `${CSI}${letter}` : `${CSI}1;1:${type}${letter}`;
const key = (codepoint: number, type = 1, mods = 1) =>
  type === 1 && mods === 1 ? `${CSI}${codepoint}u` : `${CSI}${codepoint};${mods}:${type}u`;
const PRESS = 1;
const REPEAT = 2;
const RELEASE = 3;

/** The signals the precise adapter makes of `chunks`, each stamped with its index as its time. */
async function signals(chunks: readonly string[]): Promise<(InputSignal | null)[]> {
  const raws = await parseTerminalBytes(chunks);
  const adapter = createPreciseAdapter(DEFAULT_BINDINGS);
  return raws.map((raw, time) => adapter.feed({ ...raw, time })[0] ?? null);
}

describe('precise adapter', () => {
  it('turns arrow press, repeat and release into key events', async () => {
    expect(
      await signals([arrow('D'), arrow('D', REPEAT), arrow('D', REPEAT), arrow('D', RELEASE)]),
    ).toEqual([
      { kind: 'key', event: { action: MoveLeft, kind: 'press', time: 0 } },
      { kind: 'key', event: { action: MoveLeft, kind: 'repeat', time: 1 } },
      { kind: 'key', event: { action: MoveLeft, kind: 'repeat', time: 2 } },
      { kind: 'key', event: { action: MoveLeft, kind: 'release', time: 3 } },
    ]);
  });

  it('maps every default binding (design §7.4)', async () => {
    const actions = (
      await signals([
        arrow('D'),
        arrow('C'),
        arrow('B'),
        arrow('A'),
        key(32), // Space
        key(120), // X
        key(122), // Z
        key(97), // A
        key(99), // C
      ])
    ).map((signal) => (signal?.kind === 'key' ? signal.event.action : null));
    expect(actions).toEqual([
      MoveLeft,
      MoveRight,
      SoftDrop,
      RotateCW,
      HardDrop,
      RotateCW,
      RotateCCW,
      Rotate180,
      Hold,
    ]);
  });

  it('reports release and repeat for letter keys too', async () => {
    expect(await signals([key(32, PRESS), key(32, REPEAT), key(32, RELEASE)])).toEqual([
      { kind: 'key', event: { action: HardDrop, kind: 'press', time: 0 } },
      { kind: 'key', event: { action: HardDrop, kind: 'repeat', time: 1 } },
      { kind: 'key', event: { action: HardDrop, kind: 'release', time: 2 } },
    ]);
  });

  it('keeps a key held through several keys in one read', async () => {
    const actions = await signals([`${arrow('C')}${key(120)}${arrow('C', RELEASE)}`]);
    expect(actions.map((signal) => signal?.kind === 'key' && signal.event.kind)).toEqual([
      'press',
      'press',
      'release',
    ]);
  });

  it('opens the menu on an Esc or P press only', async () => {
    expect(
      await signals([key(27), key(27, RELEASE), key(112), key(112, REPEAT), key(112, RELEASE)]),
    ).toEqual([{ kind: 'menu' }, null, { kind: 'menu' }, null, null]);
  });

  it('reads a key the same with Shift or Caps Lock, and ignores it with Ctrl or Alt', async () => {
    const out = await signals([
      `${CSI}1;2D`, // Shift+Left
      key(120, PRESS, 65), // X with Caps Lock on
      key(120, PRESS, 5), // Ctrl+X
      key(120, PRESS, 3), // Alt+X
    ]);
    expect(out.map((signal) => signal?.kind === 'key' && signal.event.action)).toEqual([
      MoveLeft,
      RotateCW,
      false,
      false,
    ]);
  });

  it('ignores unbound keys', async () => {
    expect(await signals([key(113), key(57441) /* Left Shift on its own */])).toEqual([null, null]);
  });

  it('takes a key without an event type as a press', async () => {
    expect(await signals(['x'])).toEqual([
      { kind: 'key', event: { action: RotateCW, kind: 'press', time: 0 } },
    ]);
  });
});
