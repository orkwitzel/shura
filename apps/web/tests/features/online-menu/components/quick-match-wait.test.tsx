import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { QuickMatchWait } from '@/features/online-menu/components/quick-match-wait';

const press = (key: string) => fireEvent.keyDown(window, { key, code: key });

describe('QuickMatchWait', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('while searching, shows the time waited, and Esc cancels', () => {
    const onCancel = vi.fn();
    render(
      <QuickMatchWait
        status="searching"
        since={performance.now()}
        onCancel={onCancel}
        onSearchAgain={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Quick match' })).toBeInTheDocument();
    expect(screen.getByText('Looking for an opponent…')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    act(() => vi.advanceTimersByTime(65_000));
    expect(screen.getByRole('timer')).toHaveTextContent('1:05');
    press('Escape');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test('after the opponent left, says so: Enter searches again, Esc goes back', () => {
    const onCancel = vi.fn();
    const onSearchAgain = vi.fn();
    render(
      <QuickMatchWait
        status="opponentLeft"
        since={performance.now()}
        onCancel={onCancel}
        onSearchAgain={onSearchAgain}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Opponent left' })).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    press('Enter');
    expect(onSearchAgain).toHaveBeenCalledOnce();
    press('Escape');
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
