import { fireEvent, render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { useScreenHotkeys } from '@/lib/keyboard/use-screen-hotkeys';

function Screen({ onKey, enabled = true }: { onKey: (key: string) => void; enabled?: boolean }) {
  useScreenHotkeys('escape, enter', (_event, { keys }) => onKey(keys?.[0] ?? ''), { enabled });
  return <input aria-label="Field" />;
}

/** Presses `code` on the page, as a screen's keys hear it: whether something handled it. */
const press = (code: string, init: KeyboardEventInit = {}) =>
  !fireEvent.keyDown(document.body, { code, key: code, ...init });

test('a screen’s key runs its callback from anywhere on the page, and is handled', () => {
  const onKey = vi.fn();
  const { getByLabelText } = render(<Screen onKey={onKey} />);
  expect(press('Escape')).toBe(true);
  fireEvent.keyDown(getByLabelText('Field'), { code: 'Enter', key: 'Enter' });
  expect(onKey.mock.calls).toEqual([['escape'], ['enter']]);
});

test('not on the key repeat, nor for a key something else handled, nor while disabled', () => {
  const onKey = vi.fn();
  const { rerender } = render(<Screen onKey={onKey} />);
  press('Escape', { repeat: true });
  const handled = new KeyboardEvent('keydown', {
    code: 'Escape',
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  handled.preventDefault();
  document.body.dispatchEvent(handled);
  rerender(<Screen onKey={onKey} enabled={false} />);
  press('Escape');
  expect(onKey).not.toHaveBeenCalled();
});
