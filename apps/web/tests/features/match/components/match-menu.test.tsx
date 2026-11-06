import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MatchMenu } from '@/features/match/components/match-menu';

describe('MatchMenu (design §7.4, online)', () => {
  test('has Back to game, where the cursor starts, and Leave match, and nothing else', () => {
    render(<MatchMenu open onBack={() => {}} onLeave={() => {}} />);
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Back to game'),
      expect.stringContaining('Leave match'),
    ]);
    expect(items[0]).toHaveFocus();
  });

  test('Esc and Enter go back to the game; Q leaves the match', async () => {
    const onBack = vi.fn();
    const onLeave = vi.fn();
    render(<MatchMenu open onBack={onBack} onLeave={onLeave} />);
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Enter}');
    expect(onBack).toHaveBeenCalledTimes(2);
    await userEvent.keyboard('q');
    expect(onLeave).toHaveBeenCalledOnce();
  });
});
