import { createSoloSession, type Effects } from '@shura/client-core';
import { TSpin } from '@shura/engine';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Callouts } from '@/features/callouts/components/callouts';
import { fakeEngineEvents, lockEvent } from '../../../support/engine-events';
import { fakeClock } from '../../../support/fake-clock';
import { renderWithStores } from '../../../support/render-with-stores';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Callouts over a Sprint session whose engine events the test makes up, with `effects` set. */
function setup(effects?: Effects) {
  const session = createSoloSession({ mode: 'sprint', clock: fakeClock(0), seed: 3 });
  const { emit } = fakeEngineEvents(session);
  renderWithStores(<Callouts session={session} />, {
    stored: { settings: effects === undefined ? { version: 1 } : { version: 1, effects } },
  });
  return { session, emit };
}

/** The callouts on show, as their text. */
const shown = () =>
  Array.from(
    screen.getByRole('status', { name: 'Callouts' }).querySelectorAll('li'),
    (item) => item.textContent,
  );

describe('callouts', () => {
  test.each<Effects>(['full', 'reduced', 'off'])(
    'a T-spin double shows "T-SPIN DOUBLE", with effects %s',
    (effects) => {
      const { emit } = setup(effects);
      expect(shown()).toEqual([]);
      act(() => emit(lockEvent({ lines: 2, tSpin: TSpin.Full, backToBack: true })));
      expect(screen.getByText('T-SPIN DOUBLE')).toBeVisible();
      expect(shown()).toEqual(['T-SPIN DOUBLE']);
    },
  );

  test('show a lock’s callouts together: back-to-back, combo and perfect clear', () => {
    const { emit } = setup();
    act(() => {
      emit(lockEvent({ lines: 4, backToBack: true }));
      emit(lockEvent({ lines: 4, backToBack: true, combo: 2, perfectClear: true }));
    });
    expect(shown()).toEqual(['TETRIS', 'BACK-TO-BACK', 'COMBO 2', 'PERFECT CLEAR']);
  });

  test('a newer lock’s callouts take the place of the older’s, and go after 2 s', () => {
    const { emit } = setup();
    act(() => emit(lockEvent({ lines: 1 })));
    act(() => vi.advanceTimersByTime(1_000));
    act(() => emit(lockEvent({ lines: 2, combo: 1 })));
    expect(shown()).toEqual(['DOUBLE', 'COMBO 1']);
    act(() => vi.advanceTimersByTime(1_999));
    expect(shown()).toEqual(['DOUBLE', 'COMBO 1']);
    act(() => vi.advanceTimersByTime(1));
    expect(shown()).toEqual([]);
  });

  test.each<[Effects, boolean]>([
    ['full', true],
    ['reduced', true],
    ['off', false],
  ])('with effects %s, pop in and grow with the combo: %s', (effects, lively) => {
    const { emit } = setup(effects);
    act(() => emit(lockEvent({ lines: 1, combo: 4 })));
    const list = screen.getByRole('list');
    expect(list.hasAttribute('data-pop')).toBe(lively);
    expect(list.style.getPropertyValue('--combo')).toBe(lively ? '4' : '');
  });

  test('stop when unmounted', () => {
    const session = createSoloSession({ mode: 'sprint', clock: fakeClock(0), seed: 3 });
    const { emit } = fakeEngineEvents(session);
    const { unmount } = renderWithStores(<Callouts session={session} />);
    unmount();
    expect(() => emit(lockEvent({ lines: 4 }))).not.toThrow();
  });
});
