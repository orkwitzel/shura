import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { Toggle } from '@/components/ui/toggle';

describe('Toggle', () => {
  test('is a switch on a checkbox, named by its label', () => {
    render(<Toggle label="Ghost" checked onChange={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: 'Ghost' });
    expect(toggle).toHaveAttribute('type', 'checkbox');
    expect(toggle).toBeChecked();
  });

  test('Space flips it, from the keyboard alone', async () => {
    const onChange = vi.fn<(checked: boolean) => void>();
    render(<Toggle label="Ghost" checked onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole('switch', { name: 'Ghost' })).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});
