import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { App } from '@/app/app';
import { setMedia } from '../support/match-media';

const mainMenu = () => screen.queryByRole('menu', { name: 'Main menu' });

beforeEach(() => window.history.replaceState(null, '', '/'));

describe('App', () => {
  test('opens on the main menu, in the selected theme', () => {
    render(<App />);
    expect(mainMenu()).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--color-panel')).toBe('rgb(42 26 77)');
  });

  test("the browser's Back and Forward move between the menu and the routes it opened", async () => {
    render(<App />);
    await userEvent.keyboard('{Enter}');
    expect(window.location.pathname).toBe('/solo/sprint');
    expect(screen.getByRole('heading', { name: 'Sprint' })).toBeInTheDocument();

    act(() => window.history.back());
    await waitFor(() => expect(mainMenu()).toBeInTheDocument());
    expect(window.location.pathname).toBe('/');

    act(() => window.history.forward());
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Sprint' })).toBeInTheDocument(),
    );
  });

  test('a touch device with no keyboard is told Shura needs one', () => {
    setMedia('(hover: none) and (pointer: coarse)', true);
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Shura needs a keyboard' })).toBeInTheDocument();
    expect(mainMenu()).not.toBeInTheDocument();
  });
});
