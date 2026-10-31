import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AppRouter } from '@/app/router';
import { FakeAudioContext, resetFakeAudio, settle } from '../support/fake-audio-context';
import { renderWithStores } from '../support/render-with-stores';

/** The countdown before Go (design §13.1). */
const COUNTDOWN_MS = 1_500;

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
  renderWithStores(<AppRouter />, { path: '/solo/sprint' });
  await act(async () => {});
  // The first key press, during the countdown, starts audio and loads the sounds.
  fireEvent.keyDown(window, { code: 'KeyQ' });
  await act(settle);
  act(() => vi.advanceTimersByTime(COUNTDOWN_MS + 100));
  act(() => {
    fireEvent.keyDown(window, { code: 'Space' });
    fireEvent.keyUp(window, { code: 'Space' });
  });
  act(() => vi.advanceTimersByTime(100));

  expect(FakeAudioContext.made).toHaveLength(1);
  expect(FakeAudioContext.made[0]?.played).toEqual([
    { url: '/sounds/hard-drop.mp3', rate: 1, gain: 0.5 },
    { url: '/sounds/lock.mp3', rate: 1, gain: 0.5 },
  ]);
});
