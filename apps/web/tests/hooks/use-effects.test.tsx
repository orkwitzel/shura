import { act, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useEffects } from '@/hooks/use-effects';
import { setMedia } from '../support/match-media';
import { renderWithStores } from '../support/render-with-stores';

const REDUCE = '(prefers-reduced-motion: reduce)';

function Effects() {
  return <output>{useEffects()}</output>;
}

describe('useEffects', () => {
  test('while unset, is Full when the system has no preference', () => {
    renderWithStores(<Effects />);
    expect(screen.getByRole('status')).toHaveTextContent('full');
  });

  test('while unset, follows prefers-reduced-motion as it changes', () => {
    setMedia(REDUCE, true);
    renderWithStores(<Effects />);
    expect(screen.getByRole('status')).toHaveTextContent('reduced');
    act(() => setMedia(REDUCE, false));
    expect(screen.getByRole('status')).toHaveTextContent('full');
  });

  test('once set, is the setting, whatever the system asks', () => {
    setMedia(REDUCE, true);
    const { stores } = renderWithStores(<Effects />);
    act(() => stores.settings.update({ effects: 'full' }));
    expect(screen.getByRole('status')).toHaveTextContent('full');
    act(() => stores.settings.update({ effects: 'off' }));
    expect(screen.getByRole('status')).toHaveTextContent('off');
  });
});
