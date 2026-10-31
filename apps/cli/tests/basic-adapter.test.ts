import { ActionType } from '@shura/engine';
import { describe, expect, it } from 'vitest';
import { createBasicAdapter } from '../src/input/basic';
import { DEFAULT_BINDINGS } from '../src/input/bindings';
import type { InputSignal } from '../src/input/terminal-input';
import { parseTimedBytes } from './support/terminal-bytes';

const { MoveLeft, MoveRight, SoftDrop, RotateCW } = ActionType;

/** Legacy sequences, as a terminal without the Kitty protocol sends them. */
const CSI = '\x1b[';
const LEFT = `${CSI}D`;
const RIGHT = `${CSI}C`;
const DOWN = `${CSI}B`;

/**
 * The signals the basic adapter makes of `chunks` (`[time, bytes]`, one terminal read each), then
 * of polling at `until`, when every key has long been let go.
 */
async function signals(chunks: readonly [number, string][], until = 10_000) {
  const inputs = await parseTimedBytes(chunks.map(([time, bytes]) => ({ time, bytes })));
  const adapter = createBasicAdapter(DEFAULT_BINDINGS);
  const out: InputSignal[] = [];
  for (const input of inputs) out.push(...adapter.feed(input));
  out.push(...adapter.poll(until));
  return out;
}

const key = (action: string, kind: string, time: number) => ({
  kind: 'key',
  event: { action, kind, time },
});

describe('basic adapter', () => {
  it('turns a tap into a press, and a release about 500 ms later', async () => {
    expect(await signals([[0, LEFT]])).toEqual([
      key(MoveLeft, 'press', 0),
      key(MoveLeft, 'release', 550),
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
      key(MoveLeft, 'press', 0),
      key(MoveLeft, 'repeat', 500),
      key(MoveLeft, 'repeat', 530),
      key(MoveLeft, 'repeat', 560),
      key(MoveLeft, 'repeat', 590),
      key(MoveLeft, 'release', 650),
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
      key(MoveRight, 'press', 1_000),
      key(MoveRight, 'repeat', 1_500),
      key(MoveRight, 'release', 1_560),
    ]);
  });

  it('takes a key that comes back after its release for a new press', async () => {
    expect(
      await signals([
        [0, LEFT],
        [800, LEFT],
      ]),
    ).toEqual([
      key(MoveLeft, 'press', 0),
      key(MoveLeft, 'release', 550),
      key(MoveLeft, 'press', 800),
      key(MoveLeft, 'release', 1_350),
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
      key(RotateCW, 'press', 0),
      key(RotateCW, 'repeat', 500),
      key(RotateCW, 'release', 1_050),
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
      key(SoftDrop, 'press', 0),
      key(SoftDrop, 'repeat', 500),
      key(SoftDrop, 'repeat', 530),
      key(MoveLeft, 'press', 540),
      key(SoftDrop, 'release', 590),
      key(MoveLeft, 'release', 1_090),
    ]);
  });

  it('honours a real release, for a terminal that sends them anyway', async () => {
    expect(
      await signals([
        [0, LEFT],
        [500, `${CSI}1;1:2D`],
        [530, `${CSI}1;1:3D`],
      ]),
    ).toEqual([
      key(MoveLeft, 'press', 0),
      key(MoveLeft, 'repeat', 500),
      key(MoveLeft, 'release', 530),
    ]);
  });
});
