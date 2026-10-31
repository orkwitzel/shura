import { ActionType } from '@shura/engine';
import { describe, expect, it } from 'vitest';
import { createBasicAdapter } from '../../../src/platform/input/basic-adapter';
import { DEFAULT_BINDINGS } from '../../../src/platform/input/bindings';
import { replay, timed } from '../../support/replay';
import { DOWN, LEFT, LEFT_RELEASE, LEFT_REPEAT, RIGHT } from '../../support/sequences';
import { keySignal } from '../../support/signals';

const { MoveLeft, MoveRight, SoftDrop, HardDrop, RotateCW } = ActionType;

/**
 * The signals the basic adapter makes of `chunks` (`[time, bytes]`, one terminal read each), then
 * of polling at `until`, when every key has long been let go.
 */
function signals(chunks: readonly [number, string][], until = 10_000) {
  return replay(createBasicAdapter(DEFAULT_BINDINGS), timed(chunks), until);
}

describe('basic adapter', () => {
  it('turns a tap into a press, and a release about 500 ms later', async () => {
    expect(await signals([[0, LEFT]])).toEqual([
      keySignal(MoveLeft, 'press', 0),
      keySignal(MoveLeft, 'release', 550),
    ]);
  });

  it('turns OS key repeat into repeats, and assumes a release after 2× the repeat interval', async () => {
    expect(
      await signals([
        [0, LEFT],
        [500, LEFT],
        [530, LEFT],
        [560, LEFT],
        [590, LEFT],
      ]),
    ).toEqual([
      keySignal(MoveLeft, 'press', 0),
      keySignal(MoveLeft, 'repeat', 500),
      keySignal(MoveLeft, 'repeat', 530),
      keySignal(MoveLeft, 'repeat', 560),
      keySignal(MoveLeft, 'repeat', 590),
      keySignal(MoveLeft, 'release', 650),
    ]);
  });

  it('keeps the repeat interval it learned for the next key: the OS repeat rate is global', async () => {
    const out = await signals([
      [0, LEFT],
      [500, LEFT],
      [530, LEFT],
      [560, LEFT],
      [1_000, RIGHT],
      [1_500, RIGHT],
    ]);
    expect(out.slice(-3)).toEqual([
      keySignal(MoveRight, 'press', 1_000),
      keySignal(MoveRight, 'repeat', 1_500),
      keySignal(MoveRight, 'release', 1_560),
    ]);
  });

  it('takes a key that comes back after its release for a new press', async () => {
    expect(
      await signals([
        [0, LEFT],
        [800, LEFT],
      ]),
    ).toEqual([
      keySignal(MoveLeft, 'press', 0),
      keySignal(MoveLeft, 'release', 550),
      keySignal(MoveLeft, 'press', 800),
      keySignal(MoveLeft, 'release', 1_350),
    ]);
  });

  it('takes quick taps of one key for separate presses: a byte before the OS repeat delay is no repeat', async () => {
    expect(
      await signals([
        [0, ' '],
        [80, ' '],
        [160, ' '],
      ]),
    ).toEqual([
      keySignal(HardDrop, 'press', 0),
      keySignal(HardDrop, 'release', 80),
      keySignal(HardDrop, 'press', 80),
      keySignal(HardDrop, 'release', 160),
      keySignal(HardDrop, 'press', 160),
      keySignal(HardDrop, 'release', 710),
    ]);
  });

  it('takes a byte too soon after the last for a tap as a repeat', async () => {
    // An OS delay shorter than the CLI assumes: the first repeat reads as a tap, but the repeats
    // after it come faster than anyone taps.
    expect(
      await signals([
        [0, 'x'],
        [120, 'x'],
        [150, 'x'],
        [180, 'x'],
      ]),
    ).toEqual([
      keySignal(RotateCW, 'press', 0),
      keySignal(RotateCW, 'release', 120),
      keySignal(RotateCW, 'press', 120),
      keySignal(RotateCW, 'repeat', 150),
      keySignal(RotateCW, 'repeat', 180),
      keySignal(RotateCW, 'release', 240),
    ]);
  });

  it('learns the OS repeat delay from a hold: earlier bytes are taps, and a tap is let go sooner', async () => {
    const out = await signals([
      // A hold: the first repeat after 300 ms, then every 30 ms.
      [0, LEFT],
      [300, LEFT],
      [330, LEFT],
      [360, LEFT],
      // Two taps 200 ms apart: sooner than the delay could bring a repeat.
      [1_000, 'x'],
      [1_200, 'x'],
    ]);
    expect(out.slice(-4)).toEqual([
      keySignal(RotateCW, 'press', 1_000),
      keySignal(RotateCW, 'release', 1_200),
      keySignal(RotateCW, 'press', 1_200),
      // The delay, with a margin: no longer the 550 ms assumed before any hold.
      keySignal(RotateCW, 'release', 1_200 + 350),
    ]);
  });

  it('keeps a key held through a learned OS delay longer than 550 ms', async () => {
    const out = await signals([
      [0, LEFT],
      [660, LEFT],
      [700, LEFT],
      [740, LEFT],
      [2_000, 'x'],
      [2_660, 'x'],
    ]);
    expect(out.slice(-3)).toEqual([
      keySignal(RotateCW, 'press', 2_000),
      keySignal(RotateCW, 'repeat', 2_660),
      keySignal(RotateCW, 'release', 2_660 + 80),
    ]);
  });

  it('maps letter keys sent as plain text, and opens the menu once for a held P', async () => {
    expect(
      await signals([
        [0, 'x'],
        [500, 'x'],
        [1_100, 'p'],
        [1_600, 'p'],
        [1_630, 'p'],
      ]),
    ).toEqual([
      keySignal(RotateCW, 'press', 0),
      keySignal(RotateCW, 'repeat', 500),
      keySignal(RotateCW, 'release', 1_050),
      { kind: 'menu' },
    ]);
  });

  it('infers each held key’s release on its own, in time order', async () => {
    expect(
      await signals([
        [0, DOWN],
        [500, DOWN],
        [530, DOWN],
        [540, LEFT],
      ]),
    ).toEqual([
      keySignal(SoftDrop, 'press', 0),
      keySignal(SoftDrop, 'repeat', 500),
      keySignal(SoftDrop, 'repeat', 530),
      keySignal(MoveLeft, 'press', 540),
      keySignal(SoftDrop, 'release', 590),
      keySignal(MoveLeft, 'release', 1_090),
    ]);
  });

  it('honours a real release, for a terminal that sends them anyway', async () => {
    expect(
      await signals([
        [0, LEFT],
        [500, LEFT_REPEAT],
        [530, LEFT_RELEASE],
      ]),
    ).toEqual([
      keySignal(MoveLeft, 'press', 0),
      keySignal(MoveLeft, 'repeat', 500),
      keySignal(MoveLeft, 'release', 530),
    ]);
  });
});
