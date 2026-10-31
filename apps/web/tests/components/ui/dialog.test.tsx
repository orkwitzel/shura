import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

describe('Dialog', () => {
  test('shows nothing while closed', () => {
    render(
      <Dialog open={false} title="Paused" onClose={() => {}}>
        <p>Resume?</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('opens as a native modal <dialog> named by its title', () => {
    render(
      <Dialog open title="Paused" onClose={() => {}}>
        <p>Resume?</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Paused' });
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByText('Resume?')).toBeVisible();
  });

  test('Esc asks to close it', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Paused" onClose={onClose}>
        <Button autoFocus>Resume</Button>
      </Dialog>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  test('it stays open until its owner closes it', async () => {
    const { rerender } = render(
      <Dialog open title="Paused" onClose={() => {}}>
        <Button autoFocus>Resume</Button>
      </Dialog>,
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
    rerender(
      <Dialog open={false} title="Paused" onClose={() => {}}>
        <Button autoFocus>Resume</Button>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('an Esc that something inside has already handled does not ask to close it', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Paused" onClose={onClose}>
        <Button autoFocus onKeyDown={(event) => event.preventDefault()}>
          Resume
        </Button>
      </Dialog>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});
