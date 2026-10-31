import { act } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useTheme } from '@/hooks/use-theme';
import { renderWithStores } from '../support/render-with-stores';

function Themed() {
  useTheme();
  return null;
}

const variable = (name: string) => document.documentElement.style.getPropertyValue(name);

describe('useTheme', () => {
  test("sets the selected theme's colours on :root", () => {
    renderWithStores(<Themed />);
    expect(variable('--color-background')).toBe('rgb(27 15 54)');
    expect(variable('--color-text')).toBe('rgb(255 244 220)');
    expect(variable('--color-accent')).toBe('rgb(255 210 63)');
    expect(variable('--color-panel')).toBe('rgb(42 26 77)');
    expect(variable('--color-deep')).toBe('rgb(18 8 38)');
    expect(variable('--color-shadow')).toBe('rgb(10 4 20)');
    expect(variable('--color-muted')).toBe('rgb(201 191 224)');
    expect(variable('--color-swirl-1')).toBe('rgb(255 77 109 / 0.45)');
    expect(variable('--color-swirl-3')).toBe('rgb(255 210 63 / 0.25)');
    expect(variable('--color-well-a')).toBe('rgb(23 12 46)');
    expect(variable('--color-well-b')).toBe('rgb(28 16 56)');
  });

  test('a saved theme is used from the start', () => {
    renderWithStores(<Themed />, { stored: { settings: { version: 1, theme: 'deep-sea' } } });
    expect(variable('--color-panel')).toBe('rgb(16 48 77)');
  });

  test('the colours change, without a reload, when the theme setting changes', () => {
    const { stores } = renderWithStores(<Themed />);
    act(() => stores.settings.update({ theme: 'plum' }));
    expect(variable('--color-background')).toBe('rgb(42 11 42)');
    expect(variable('--color-panel')).toBe('rgb(61 22 64)');
    expect(variable('--color-swirl-2')).toBe('rgb(255 77 170 / 0.42)');
  });
});
