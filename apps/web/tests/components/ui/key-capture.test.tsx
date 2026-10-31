import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { KeyCapture, type KeyCaptureProps } from '@/components/ui/key-capture';

function keyCapture(props: Partial<KeyCaptureProps> = {}) {
  const onCapture = vi.fn<(code: string) => string | undefined>();
  const onClear = vi.fn<() => void>();
  render(
    <KeyCapture label="Hold" value="KeyC" onCapture={onCapture} onClear={onClear} {...props} />,
  );
  return { onCapture, onClear, button: screen.getByRole('button', { name: /Hold/ }) };
}

describe('KeyCapture', () => {
  test("is a button showing its key's name", () => {
    const { button } = keyCapture({ value: 'ShiftLeft' });
    expect(button).toHaveTextContent('Left Shift');
    expect(button).toHaveAccessibleName('Hold: Left Shift');
  });

  test('an empty slot shows a plus and adds a key', () => {
    const { button } = keyCapture({ value: undefined });
    expect(button).toHaveTextContent('+');
    expect(button).toHaveAccessibleName('Hold: add a key');
  });

  test('Enter asks for a key, and the next key pressed is captured by its code', async () => {
    const { button, onCapture } = keyCapture();
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(button).toHaveTextContent('Press a key');
    await userEvent.keyboard('{Shift>}');
    expect(onCapture).toHaveBeenCalledExactlyOnceWith('ShiftLeft');
    expect(button).not.toHaveTextContent('Press a key');
  });

  test('a click asks for a key too', async () => {
    const { button, onCapture } = keyCapture();
    await userEvent.click(button);
    await userEvent.keyboard(' ');
    expect(onCapture).toHaveBeenCalledExactlyOnceWith('Space');
    expect(button).not.toHaveTextContent('Press a key');
  });

  test('a captured key does nothing else: its default is prevented', async () => {
    const { button } = keyCapture();
    await userEvent.click(button);
    expect(fireEvent.keyDown(button, { code: 'ArrowDown', key: 'ArrowDown' })).toBe(false);
  });

  test("ignores the browser's key repeat", async () => {
    const { button, onCapture } = keyCapture();
    await userEvent.click(button);
    fireEvent.keyDown(button, { code: 'Enter', key: 'Enter', repeat: true });
    expect(onCapture).not.toHaveBeenCalled();
    expect(button).toHaveTextContent('Press a key');
  });

  test('Esc cancels, without reaching anything outside', async () => {
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    const { button, onCapture } = keyCapture();
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    window.removeEventListener('keydown', outside);
    expect(onCapture).not.toHaveBeenCalled();
    expect(outside).not.toHaveBeenCalled();
    expect(button).not.toHaveTextContent('Press a key');
  });

  test('a refused key keeps it waiting, saying why', async () => {
    const { button, onCapture } = keyCapture();
    onCapture.mockImplementation((code) => (code === 'KeyP' ? 'P opens the menu.' : undefined));
    await userEvent.click(button);
    await userEvent.keyboard('p');
    expect(button).toHaveTextContent('Press a key');
    expect(screen.getByText('P opens the menu.')).toBeInTheDocument();
    await userEvent.keyboard('v');
    expect(onCapture).toHaveBeenLastCalledWith('KeyV');
    expect(screen.queryByText('P opens the menu.')).not.toBeInTheDocument();
  });

  test('leaving it while it waits cancels', async () => {
    const { button, onCapture } = keyCapture();
    await userEvent.click(button);
    await userEvent.tab();
    expect(button).not.toHaveFocus();
    expect(button).not.toHaveTextContent('Press a key');
    expect(onCapture).not.toHaveBeenCalled();
  });

  test('Delete or Backspace clears the key', async () => {
    const { button, onClear } = keyCapture();
    button.focus();
    await userEvent.keyboard('{Delete}');
    await userEvent.keyboard('{Backspace}');
    expect(onClear).toHaveBeenCalledTimes(2);
  });
});
