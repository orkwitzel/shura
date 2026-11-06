import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { OnlineMenu } from '@/features/online-menu/components/online-menu';

function menu() {
  const props = {
    onQuickMatch: vi.fn(),
    onCreateRoom: vi.fn(),
    onJoinRoom: vi.fn(),
    onBack: vi.fn(),
  };
  render(<OnlineMenu {...props} />);
  return props;
}

const items = (name: string) =>
  within(screen.getByRole('menu', { name }))
    .getAllByRole('menuitem')
    .map((item) => item.textContent);
const codeField = () => screen.getByRole('textbox', { name: 'Room code' });

describe('OnlineMenu', () => {
  test('offers Quick match, Create room, Join room and Back, starting on Quick match', () => {
    menu();
    expect(items('Play online')).toEqual(['Quick match', 'Create room', 'Join room', 'BackEsc']);
    expect(screen.getByRole('menuitem', { name: 'Quick match' })).toHaveFocus();
  });

  test('Enter on Quick match asks for one', async () => {
    const { onQuickMatch } = menu();
    await userEvent.keyboard('{Enter}');
    expect(onQuickMatch).toHaveBeenCalledOnce();
  });

  test('Create room asks which mode, 1v1 or FFA', async () => {
    const { onCreateRoom } = menu();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(items('Create room')).toEqual(['1v1', 'FFA', 'BackEsc']);
    expect(screen.getByRole('menuitem', { name: '1v1' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onCreateRoom).toHaveBeenCalledWith('ffa');
  });

  test('Esc in Create room goes back to the menu, and Esc there goes back', async () => {
    const { onBack, onCreateRoom } = menu();
    await userEvent.keyboard('{ArrowDown}{Enter}{Escape}');
    expect(screen.getByRole('menuitem', { name: 'Create room' })).toHaveFocus();
    expect(onBack).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onBack).toHaveBeenCalledOnce();
    expect(onCreateRoom).not.toHaveBeenCalled();
  });

  test('Join room takes a code, uppercased as it’s typed, and Enter joins it', async () => {
    const { onJoinRoom } = menu();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(codeField()).toHaveFocus();
    await userEvent.keyboard('k7qx');
    expect(codeField()).toHaveValue('K7QX');
    await userEvent.keyboard('{Enter}');
    expect(onJoinRoom).toHaveBeenCalledWith('K7QX');
  });

  test('a code refuses the removed characters at once, saying why', async () => {
    menu();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await userEvent.keyboard('k0o1il');
    expect(codeField()).toHaveValue('K');
    expect(screen.getByRole('alert')).toHaveTextContent('Codes have no 0, O, 1, I or L.');
    await userEvent.keyboard('7');
    expect(codeField()).toHaveValue('K7');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a code joins only once it’s whole', async () => {
    const { onJoinRoom } = menu();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await userEvent.keyboard('K7Q{Enter}');
    expect(onJoinRoom).not.toHaveBeenCalled();
    await userEvent.keyboard('XZ{Enter}');
    expect(codeField()).toHaveValue('K7QX');
    expect(onJoinRoom).toHaveBeenCalledWith('K7QX');
  });

  test('Esc in Join room goes back to the menu, on Join room', async () => {
    const { onBack } = menu();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}{Escape}');
    expect(screen.getByRole('menuitem', { name: 'Join room' })).toHaveFocus();
    expect(onBack).not.toHaveBeenCalled();
  });
});
