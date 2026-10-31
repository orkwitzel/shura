import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FakeAudioContext, resetFakeAudio, settle } from '../support/fake-audio-context';
import { COUNTDOWN_MS, play, runTo, tap } from '../support/solo-game';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  vi.stubGlobal('AudioContext', FakeAudioContext);
  // Each file "holds" its own URL, which the fake context decodes back.
  vi.stubGlobal('fetch', (url: string) => Promise.resolve(new Response(url)));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetFakeAudio();
});

test('a game plays its sounds once a key has been pressed', async () => {
  // The game starts (its countdown) once the board has been drawn.
  const { start } = await play('/solo/sprint', 'Sprint');
  // The first key press, during the countdown, starts audio and loads the sounds.
  fireEvent.keyDown(window, { code: 'KeyB' });
  await act(settle);
  runTo(start + COUNTDOWN_MS + 100);
  tap('Space');
  runTo(performance.now() + 100);

  expect(FakeAudioContext.made).toHaveLength(1);
  expect(FakeAudioContext.made[0]?.played).toEqual([
    { url: '/sounds/hard-drop.mp3', rate: 1, gain: 0.5 },
    { url: '/sounds/lock.mp3', rate: 1, gain: 0.5 },
  ]);
});
