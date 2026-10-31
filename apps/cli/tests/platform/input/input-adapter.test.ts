import { ActionType } from '@shura/engine';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../../../src/platform/input/bindings';
import {
  autoShiftOf,
  createInputAdapter,
  type InputAdapter,
  type InputChoice,
  type InputSignal,
} from '../../../src/platform/input/input-adapter';
import { replay, timed } from '../../support/replay';
import { LEFT, LEFT_RELEASE, LEFT_REPEAT, SPACE_KITTY } from '../../support/sequences';
import { keySignal } from '../../support/signals';

const { MoveLeft } = ActionType;

/** An adapter for `choice` and a way to feed it timed terminal bytes. */
function adapter(choice: InputChoice) {
  const input = createInputAdapter(choice, DEFAULT_BINDINGS);
  return {
    input,
    feed: (...chunks: [number, string][]): Promise<InputSignal[]> => replay(input, timed(chunks)),
  };
}

const status = ({ name }: InputAdapter) => ({ name, autoShift: autoShiftOf(name) });

describe('auto-detection', () => {
  it('starts out choosing, auto-shifting by key repeat', () => {
    expect(status(adapter('auto').input)).toEqual({ name: 'auto', autoShift: 'keyRepeat' });
  });

  it('picks precise at the first Kitty-protocol release, which it passes on', async () => {
    const auto = adapter('auto');
    expect(await auto.feed([0, LEFT])).toEqual([keySignal(MoveLeft, 'press', 0)]);
    expect(status(auto.input).name).toBe('auto');
    expect(await auto.feed([90, LEFT_RELEASE])).toEqual([keySignal(MoveLeft, 'release', 90)]);
    expect(status(auto.input)).toEqual({ name: 'precise', autoShift: 'handling' });
    expect(auto.input.deadline).toBeNull();
  });

  it('picks precise at a Kitty-protocol repeat', async () => {
    const auto = adapter('auto');
    await auto.feed([0, LEFT], [400, LEFT_REPEAT]);
    expect(status(auto.input).name).toBe('precise');
  });

  it('picks precise at a key that types text, sent as a Kitty-protocol sequence', async () => {
    const auto = adapter('auto');
    await auto.feed([0, SPACE_KITTY]);
    expect(status(auto.input).name).toBe('precise');
  });

  it('picks basic at a key that types text, sent as its plain byte', async () => {
    const auto = adapter('auto');
    await auto.feed([0, ' ']);
    expect(status(auto.input)).toEqual({ name: 'basic', autoShift: 'keyRepeat' });
  });

  it('picks basic at a legacy key repeat: an arrow sent again with no release between', async () => {
    const auto = adapter('auto');
    expect(await auto.feed([0, LEFT], [500, LEFT])).toEqual([
      keySignal(MoveLeft, 'press', 0),
      keySignal(MoveLeft, 'repeat', 500),
    ]);
    expect(status(auto.input).name).toBe('basic');
  });

  it('picks basic at a quick second tap of an arrow with no release between', async () => {
    const auto = adapter('auto');
    expect(await auto.feed([0, LEFT], [80, LEFT])).toEqual([
      keySignal(MoveLeft, 'press', 0),
      keySignal(MoveLeft, 'release', 80),
      keySignal(MoveLeft, 'press', 80),
    ]);
    expect(status(auto.input).name).toBe('basic');
  });

  it('picks basic, and infers the release, when an arrow tap has had no release for a second', async () => {
    const auto = adapter('auto');
    await auto.feed([0, LEFT]);
    expect(auto.input.deadline).toBe(1_000);
    expect(auto.input.poll(999)).toEqual([]);
    expect(status(auto.input).name).toBe('auto');
    expect(auto.input.poll(1_000)).toEqual([keySignal(MoveLeft, 'release', 1_000)]);
    expect(status(auto.input).name).toBe('basic');
    expect(auto.input.deadline).toBeNull();
  });

  it('keeps an arrow held through a Kitty terminal’s OS delay before its first repeat', async () => {
    const auto = adapter('auto');
    expect(await auto.feed([0, LEFT], [660, LEFT_REPEAT], [1_400, LEFT_RELEASE])).toEqual([
      keySignal(MoveLeft, 'press', 0),
      keySignal(MoveLeft, 'repeat', 660),
      keySignal(MoveLeft, 'release', 1_400),
    ]);
  });

  it('goes back to the usual first-repeat wait once it has picked basic', async () => {
    const auto = adapter('auto');
    await auto.feed([0, ' '], [600, LEFT]);
    expect(auto.input.deadline).toBe(600 + 550);
  });
});

describe('--input', () => {
  it.each([
    ['precise', 'handling'],
    ['basic', 'keyRepeat'],
  ] as const)('%s fixes the adapter whatever the terminal sends', async (choice, autoShift) => {
    const fixed = adapter(choice);
    await fixed.feed([0, ' '], [100, SPACE_KITTY], [200, LEFT_RELEASE]);
    expect(status(fixed.input)).toEqual({ name: choice, autoShift });
  });
});
