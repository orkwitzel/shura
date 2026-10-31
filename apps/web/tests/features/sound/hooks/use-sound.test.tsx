import { createSoloSession, type SoloSession } from '@shura/client-core';
import { type EngineEvent, TSpin } from '@shura/engine';
import { act, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { createSoundPlayer, type SoundPlayer, useSound } from '@/features/sound/hooks/use-sound';
import { fakeEngineEvents, lockEvent } from '../../../support/engine-events';
import {
  FakeAudioContext,
  fakeAudioContext,
  loadUrl,
  resetFakeAudio,
  settle,
} from '../../../support/fake-audio-context';
import { fakeClock } from '../../../support/fake-clock';
import { renderWithStores } from '../../../support/render-with-stores';

afterEach(() => {
  resetFakeAudio();
});

function Sound({ session, player }: { session: SoloSession; player: SoundPlayer }) {
  useSound(session, player);
  return null;
}

/** The game's sound over a Sprint session whose engine events the test makes up. */
function setup({ volume }: { volume?: number } = {}) {
  const session = createSoloSession({ mode: 'sprint', clock: fakeClock(0), seed: 3 });
  const { emit } = fakeEngineEvents(session);
  const player = createSoundPlayer({ createContext: fakeAudioContext, load: loadUrl });
  const result = renderWithStores(<Sound session={session} player={player} />, {
    stored: { settings: volume === undefined ? { version: 1 } : { version: 1, volume } },
  });
  /** The context made at the first key press. */
  const context = () => {
    const made = FakeAudioContext.made[0];
    if (!made) throw new Error('no audio context was made');
    return made;
  };
  /** Presses a key, which lets the browser start audio, and waits for the sounds to load. */
  const pressKey = async () => {
    fireEvent.keyDown(window, { code: 'ArrowLeft' });
    await act(settle);
  };
  return { emit, context, pressKey, ...result };
}

describe('sound', () => {
  test('a lock that clears nothing plays the lock sound', async () => {
    const { emit, context, pressKey } = setup();
    await pressKey();
    act(() => emit(lockEvent()));
    expect(context().played.map((played) => played.url)).toEqual(['/sounds/lock.mp3']);
  });

  test.each<[string, EngineEvent, string[]]>([
    ['a single', lockEvent({ lines: 1 }), ['single']],
    ['a double', lockEvent({ lines: 2 }), ['double']],
    ['a triple', lockEvent({ lines: 3 }), ['triple']],
    ['a Tetris', lockEvent({ lines: 4 }), ['tetris']],
    ['a T-spin double', lockEvent({ lines: 2, tSpin: TSpin.Full }), ['t-spin']],
    ['a T-spin mini zero', lockEvent({ tSpin: TSpin.Mini }), ['t-spin']],
    ['a perfect clear', lockEvent({ lines: 4, perfectClear: true }), ['perfect-clear']],
    ['a hold', { type: 'hold', frame: 1 }, ['hold']],
    ['a turn', { type: 'turn', frame: 1, kicked: false }, ['turn']],
    ['a hard drop', { type: 'hardDrop', frame: 1, rows: 12 }, ['hard-drop']],
    ['garbage landing', { type: 'garbageLanded', frame: 1, lines: 2 }, ['garbage']],
    ['a level-up', { type: 'levelUp', frame: 1, level: 2 }, ['level-up']],
    ['a top-out', { type: 'topOut', frame: 1 }, ['top-out']],
    ['a finish', { type: 'finish', frame: 1 }, ['finish']],
  ])('%s plays its sound', async (_, event, sounds) => {
    const { emit, context, pressKey } = setup();
    await pressKey();
    act(() => emit(event));
    expect(context().played.map((played) => played.url)).toEqual(
      sounds.map((sound) => `/sounds/${sound}.mp3`),
    );
  });

  test('each combo step plays the combo sound higher than the last, up to an octave', async () => {
    const { emit, context, pressKey } = setup();
    await pressKey();
    act(() => {
      for (const combo of [0, 1, 2, 3, 12, 13, 20]) emit(lockEvent({ lines: 1, combo }));
    });
    const combos = context().played.filter((played) => played.url === '/sounds/combo.mp3');
    expect(combos.map((played) => played.rate)).toEqual([
      2 ** (1 / 12),
      2 ** (2 / 12),
      2 ** (3 / 12),
      2,
      2,
      2,
    ]);
    // The clear itself keeps its pitch.
    const singles = context().played.filter((played) => played.url === '/sounds/single.mp3');
    expect(singles.map((played) => played.rate)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  test('play at half gain at the default volume, 50', async () => {
    const { emit, context, pressKey } = setup();
    await pressKey();
    act(() => emit(lockEvent()));
    expect(context().played.map((played) => played.gain)).toEqual([0.5]);
  });

  test('the volume setting scales the gain, and changes to it apply at once', async () => {
    const { emit, context, pressKey, stores } = setup({ volume: 30 });
    await pressKey();
    act(() => emit(lockEvent()));
    act(() => stores.settings.update({ volume: 100 }));
    act(() => emit(lockEvent()));
    expect(context().played.map((played) => played.gain)).toEqual([0.3, 1]);
  });

  test('volume 0 plays nothing', async () => {
    const { emit, context, pressKey, stores } = setup({ volume: 0 });
    await pressKey();
    act(() => emit(lockEvent({ lines: 4, combo: 3 }), { type: 'finish', frame: 100 }));
    expect(context().played).toEqual([]);
    act(() => stores.settings.update({ volume: 10 }));
    act(() => emit(lockEvent()));
    expect(context().played).toEqual([{ url: '/sounds/lock.mp3', rate: 1, gain: 0.1 }]);
  });

  test('a hard drop that locks plays the drop, then the lock', async () => {
    const { emit, context, pressKey } = setup();
    await pressKey();
    act(() => emit({ type: 'hardDrop', frame: 1, rows: 12 }, lockEvent({ frame: 1 })));
    expect(context().played.map((played) => played.url)).toEqual([
      '/sounds/hard-drop.mp3',
      '/sounds/lock.mp3',
    ]);
  });

  test('nothing plays, and no audio starts, before the first key press', async () => {
    const { emit, context, pressKey } = setup();
    act(() => emit(lockEvent({ lines: 4 }), { type: 'levelUp', frame: 100, level: 2 }));
    await act(settle);
    expect(FakeAudioContext.made).toEqual([]);

    await pressKey();
    expect(context().played).toEqual([]);
    act(() => emit(lockEvent()));
    expect(context().played.map((played) => played.url)).toEqual(['/sounds/lock.mp3']);
  });

  test('each sound is loaded and decoded once, at the first key press', async () => {
    const { emit, context, pressKey } = setup();
    await pressKey();
    await pressKey();
    act(() => {
      emit(lockEvent(), lockEvent(), { type: 'turn', frame: 1, kicked: true });
      emit(lockEvent());
    });
    expect(FakeAudioContext.made).toHaveLength(1);
    expect([...context().decoded].sort()).toEqual(
      [
        'combo',
        'double',
        'finish',
        'garbage',
        'hard-drop',
        'hold',
        'level-up',
        'lock',
        'perfect-clear',
        'single',
        't-spin',
        'tetris',
        'top-out',
        'triple',
        'turn',
      ].map((sound) => `/sounds/${sound}.mp3`),
    );
    expect(context().played).toHaveLength(4);
  });

  test('a key press resumes audio the browser has suspended', async () => {
    const { emit, context, pressKey } = setup();
    await pressKey();
    context().state = 'suspended';
    await pressKey();
    expect(context().resumed).toBe(1);
    expect(context().state).toBe('running');
    act(() => emit(lockEvent()));
    expect(context().played).toHaveLength(1);
  });

  test('no sound, and no error, where the browser has no Web Audio', async () => {
    const session = createSoloSession({ mode: 'sprint', clock: fakeClock(0), seed: 3 });
    const { emit } = fakeEngineEvents(session);
    const player = createSoundPlayer({ createContext: () => undefined, load: loadUrl });
    renderWithStores(<Sound session={session} player={player} />);
    fireEvent.keyDown(window, { code: 'KeyX' });
    await act(settle);
    expect(() => act(() => emit(lockEvent({ lines: 1, combo: 2 })))).not.toThrow();
  });

  test('a sound that fails to load stays silent, and the rest still play', async () => {
    const session = createSoloSession({ mode: 'sprint', clock: fakeClock(0), seed: 3 });
    const { emit } = fakeEngineEvents(session);
    const player = createSoundPlayer({
      createContext: fakeAudioContext,
      load: (url) => (url.endsWith('/lock.mp3') ? Promise.reject(new Error('404')) : loadUrl(url)),
    });
    renderWithStores(<Sound session={session} player={player} />);
    fireEvent.keyDown(window, { code: 'KeyX' });
    await act(settle);
    act(() => emit(lockEvent(), { type: 'hold', frame: 100 }));
    expect(FakeAudioContext.made[0]?.played.map((played) => played.url)).toEqual([
      '/sounds/hold.mp3',
    ]);
  });
});
