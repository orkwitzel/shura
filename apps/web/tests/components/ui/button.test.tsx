import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  test('is a native button that never submits a form', () => {
    render(<Button>Play again</Button>);
    expect(screen.getByRole('button', { name: 'Play again' })).toHaveAttribute('type', 'button');
  });

  test('runs onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Play again</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  test('runs onClick from the keyboard', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Play again</Button>);
    screen.getByRole('button').focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  test('does nothing when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Play online
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Play online' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test('passes other button attributes through', () => {
    render(<Button aria-describedby="hint">Settings</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', 'hint');
  });
});
