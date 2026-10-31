import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { AppRouter } from '@/app/router';
import { personalBest } from '../support/records';
import { renderWithStores } from '../support/render-with-stores';

const menu = () => screen.getByRole('menu', { name: 'Main menu' });
const item = (name: string) => within(menu()).getByRole('menuitem', { name });

describe('the main menu, at /', () => {
  test('shows the logo, Play online (coming soon), the three modes and Settings, and no Quit', () => {
    renderWithStores(<AppRouter />);
    expect(screen.getByRole('heading', { name: 'Shura' })).toBeInTheDocument();
    expect(item('Play online')).toBeDisabled();
    expect(item('Play online')).toHaveAccessibleDescription('coming soon');
    expect(within(menu()).getAllByRole('menuitem')).toHaveLength(5);
    expect(item('Sprint')).toBeEnabled();
    expect(item('Marathon')).toBeEnabled();
    expect(item('Ultra')).toBeEnabled();
    expect(item('Settings')).toBeEnabled();
    expect(within(menu()).queryByRole('menuitem', { name: 'Quit' })).not.toBeInTheDocument();
  });

  test('shows each mode with its personal best beside it', () => {
    const records = { version: 1, sprint: personalBest({ frames: 3_000 }) };
    renderWithStores(<AppRouter />, { stored: { records } });
    expect(item('Sprint')).toHaveAccessibleDescription('0:50.000');
    expect(item('Marathon')).toHaveAccessibleDescription('no record yet');
    expect(item('Ultra')).toHaveAccessibleDescription('no record yet');
  });

  test('starts on Sprint, past the disabled Play online', () => {
    renderWithStores(<AppRouter />);
    expect(item('Sprint')).toHaveFocus();
  });

  test('the arrows and Enter open Settings', async () => {
    const app = renderWithStores(<AppRouter />);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    expect(app.location()).toBe('/settings');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  test.each([
    ['Sprint', 0],
    ['Marathon', 1],
    ['Ultra', 2],
  ])('the arrows and Enter open %s', async (mode, downs) => {
    const app = renderWithStores(<AppRouter />);
    await userEvent.keyboard(`${'{ArrowDown}'.repeat(downs)}{Enter}`);
    expect(app.location()).toBe(`/solo/${mode.toLowerCase()}`);
    expect(screen.getByRole('heading', { name: mode })).toBeInTheDocument();
  });

  test('tells the player when the stored settings or records could not be used', () => {
    renderWithStores(<AppRouter />, { stored: { settings: 'not json', records: 'not json' } });
    const notices = screen.getByRole('status');
    expect(notices).toHaveTextContent(/the settings can't be used .* using the defaults/);
    expect(notices).toHaveTextContent(/the records can't be used .* moved to records backup/);
  });

  test('shows no notices when storage is fine', () => {
    renderWithStores(<AppRouter />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('the other routes', () => {
  test('/settings is a placeholder that leads back to the menu', async () => {
    const app = renderWithStores(<AppRouter />, { path: '/settings' });
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(app.location()).toBe('/');
    expect(menu()).toBeInTheDocument();
  });

  test('/solo/marathon is a placeholder that leads back to the menu', async () => {
    const app = renderWithStores(<AppRouter />, { path: '/solo/marathon' });
    expect(screen.getByRole('heading', { name: 'Marathon' })).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(app.location()).toBe('/');
  });

  test('/solo/tetris redirects to /, replacing itself so Back never returns to it', () => {
    const app = renderWithStores(<AppRouter />, { path: '/solo/tetris' });
    expect(app.location()).toBe('/');
    expect(app.history).toEqual(['/']);
    expect(menu()).toBeInTheDocument();
  });

  test('an unknown route redirects to /', () => {
    const app = renderWithStores(<AppRouter />, { path: '/nowhere' });
    expect(app.location()).toBe('/');
    expect(menu()).toBeInTheDocument();
  });
});
