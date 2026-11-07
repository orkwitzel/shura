import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { NicknameDialog } from '@/features/nickname/components/nickname-dialog';

const field = () => screen.getByRole('textbox', { name: 'Nickname' });

function dialog(initial = 'Player4821') {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<NicknameDialog open initial={initial} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose };
}

describe('NicknameDialog', () => {
  test('asks for a nickname, prefilled, and Enter accepts it', async () => {
    const { onSave } = dialog();
    expect(screen.getByRole('dialog', { name: 'Pick a nickname' })).toBeInTheDocument();
    expect(field()).toHaveValue('Player4821');
    expect(field()).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledWith('Player4821');
  });

  test('saves the name as the server will use it: spaces trimmed and collapsed', async () => {
    const { onSave } = dialog('');
    await userEvent.type(field(), '  שירה   K ');
    await userEvent.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledWith('שירה K');
  });

  test.each([
    ['', 'Type a nickname.'],
    ['ThisNameIsWayTooLong', 'At most 16 characters.'],
    ['no!pe', 'Letters, digits, spaces, _ and - only.'],
  ])('checks %j as it’s typed, and refuses it', async (typed, problem) => {
    const { onSave } = dialog('');
    if (typed) await userEvent.type(field(), typed);
    expect(screen.getByRole('alert')).toHaveTextContent(problem);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    await userEvent.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled();
  });

  test('shows no problem for a good name', () => {
    dialog('Mira');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(field()).toHaveAttribute('aria-invalid', 'false');
  });

  test('Esc closes it without saving', async () => {
    const { onSave, onClose } = dialog();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
