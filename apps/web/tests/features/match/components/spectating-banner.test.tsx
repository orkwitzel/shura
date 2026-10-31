import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { SpectatingBanner } from '@/features/match/components/spectating-banner';

describe('SpectatingBanner (design §13.2, Spectating)', () => {
  test('says you’re spectating, and what comes next', () => {
    render(<SpectatingBanner detail="you take a seat at the next lobby" onLeave={() => {}} />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Spectating');
    expect(banner).toHaveTextContent('you take a seat at the next lobby');
    expect(screen.getByRole('button', { name: /Leave/ })).toHaveTextContent('Esc');
  });

  test('Esc leaves, and so does a click on Leave', async () => {
    const onLeave = vi.fn();
    render(<SpectatingBanner onLeave={onLeave} />);
    await userEvent.keyboard('{Escape}');
    expect(onLeave).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: /Leave/ }));
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  test('leaves an Esc that something on the page has already handled alone', () => {
    const onLeave = vi.fn();
    render(<SpectatingBanner onLeave={onLeave} />);
    const taken = new KeyboardEvent('keydown', { code: 'Escape', cancelable: true });
    taken.preventDefault();
    fireEvent(window, taken);
    fireEvent.keyDown(window, { code: 'Escape', repeat: true });
    expect(onLeave).not.toHaveBeenCalled();
  });
});
