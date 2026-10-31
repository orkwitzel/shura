import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { SettingsForm } from '@/features/settings/components/settings-form';
import { useTheme } from '@/hooks/use-theme';
import { setMedia } from '../../../support/match-media';
import { renderWithStores } from '../../../support/render-with-stores';

const REDUCE = '(prefers-reduced-motion: reduce)';

/** The form as the app shows it: with the theme applied to `:root`, as the shell does. */
function Themed({ onClose }: { onClose: () => void }) {
  useTheme();
  return <SettingsForm onClose={onClose} />;
}

function settingsForm(options: Parameters<typeof renderWithStores>[1] = {}) {
  const onClose = vi.fn<() => void>();
  const result = renderWithStores(<Themed onClose={onClose} />, options);
  /** The settings as last saved to storage. */
  const saved = () => JSON.parse(result.storage.texts.get('settings') ?? 'null');
  return { ...result, onClose, saved };
}

const slider = (name: string) => screen.getByRole('slider', { name });
const keyButton = (name: string) => screen.getByRole('button', { name });
const message = () => screen.getByTestId('settings-message');

describe('handling', () => {
  test('DAS shows its milliseconds and frames, and a change is saved', () => {
    const { stores, saved } = settingsForm();
    expect(slider('DAS')).toHaveAttribute('aria-valuetext', '167 ms (10 frames)');
    fireEvent.change(slider('DAS'), { target: { value: '0' } });
    expect(stores.settings.getState().handling.das).toBe(0);
    expect(saved().handling.das).toBe(0);
    expect(slider('DAS')).toHaveAttribute('aria-valuetext', '0 ms (0 frames)');
    fireEvent.change(slider('DAS'), { target: { value: '20' } });
    expect(saved().handling.das).toBe(333);
    expect(slider('DAS')).toHaveAttribute('aria-valuetext', '333 ms (20 frames)');
  });

  test('ARR goes from 0 (instant) to 83 ms, and a change is saved', () => {
    const { saved } = settingsForm();
    expect(slider('ARR')).toHaveAttribute('aria-valuetext', '33 ms (2 frames)');
    fireEvent.change(slider('ARR'), { target: { value: '1' } });
    expect(saved().handling.arr).toBe(17);
    expect(slider('ARR')).toHaveAttribute('aria-valuetext', '17 ms (1 frame)');
    fireEvent.change(slider('ARR'), { target: { value: '0' } });
    expect(slider('ARR')).toHaveAttribute('aria-valuetext', '0 ms (instant)');
  });

  test('the soft-drop factor steps from ×5 to ×40, then instant', () => {
    const { saved } = settingsForm();
    expect(slider('Soft drop factor')).toHaveAttribute('aria-valuetext', '×20');
    fireEvent.change(slider('Soft drop factor'), { target: { value: '0' } });
    expect(saved().handling.softDropFactor).toBe(5);
    fireEvent.change(slider('Soft drop factor'), { target: { value: '8' } });
    expect(saved().handling.softDropFactor).toBe('instant');
    expect(slider('Soft drop factor')).toHaveAttribute('aria-valuetext', 'instant');
  });
});

describe('bindings', () => {
  test("lists each action's keys by name, with a slot to add one", () => {
    settingsForm();
    const hold = screen.getByRole('group', { name: 'Hold' });
    expect(
      within(hold)
        .getAllByRole('button')
        .map((key) => key.textContent),
    ).toEqual(['C', 'Left Shift', 'Right Shift', '+']);
  });

  test('a key pressed for a slot is bound there and saved', async () => {
    const { saved } = settingsForm();
    await userEvent.click(keyButton('Hold: C'));
    await userEvent.keyboard('v');
    expect(saved().bindings.hold).toEqual(['KeyV', 'ShiftLeft', 'ShiftRight']);
    expect(keyButton('Hold: V')).toBeInTheDocument();
  });

  test("binding a key that's in use swaps the two actions' keys", async () => {
    const { saved } = settingsForm();
    await userEvent.click(keyButton('Hold: C'));
    await userEvent.keyboard('x');
    expect(saved().bindings.hold).toEqual(['KeyX', 'ShiftLeft', 'ShiftRight']);
    expect(saved().bindings.rotateCW).toEqual(['ArrowUp', 'KeyC']);
    expect(message()).toHaveTextContent('Rotate CW gets C.');
  });

  test('a key taken for a new slot leaves the action that had it', async () => {
    const { saved } = settingsForm();
    await userEvent.click(keyButton('Hold: add a key'));
    await userEvent.keyboard('x');
    expect(saved().bindings.hold).toEqual(['KeyC', 'ShiftLeft', 'ShiftRight', 'KeyX']);
    expect(saved().bindings.rotateCW).toEqual(['ArrowUp']);
    expect(message()).toHaveTextContent('Rotate CW loses X.');
  });

  test('Delete unbinds a key', async () => {
    const { saved } = settingsForm();
    keyButton('Hold: Left Shift').focus();
    await userEvent.keyboard('{Delete}');
    expect(saved().bindings.hold).toEqual(['KeyC', 'ShiftRight']);
  });

  test('P is refused: it opens the menu', async () => {
    const { stores } = settingsForm();
    await userEvent.click(keyButton('Hold: C'));
    await userEvent.keyboard('p');
    expect(screen.getByText('P opens the menu. Press another key.')).toBeInTheDocument();
    expect(stores.settings.getState().bindings.hold).toEqual(['KeyC', 'ShiftLeft', 'ShiftRight']);
  });

  test('Reset keys brings back the default bindings', async () => {
    const { saved } = settingsForm({
      stored: { settings: { version: 1, bindings: { hold: ['KeyV'], rotateCCW: ['KeyC'] } } },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Reset keys' }));
    expect(saved().bindings.hold).toEqual(['KeyC', 'ShiftLeft', 'ShiftRight']);
    expect(saved().bindings.rotateCCW).toEqual(['KeyZ', 'ControlLeft', 'ControlRight']);
  });

  test('warns when W, T or N is bound while Ctrl is', async () => {
    settingsForm();
    expect(screen.queryByText(/don't let a page block/)).not.toBeInTheDocument();
    await userEvent.click(keyButton('Rotate 180°: A'));
    await userEvent.keyboard('w');
    expect(screen.getByRole('alert')).toHaveTextContent("Browsers don't let a page block Ctrl+W");
  });
});

describe('display', () => {
  test('the ghost toggle is saved', async () => {
    const { saved } = settingsForm();
    const ghost = screen.getByRole('switch', { name: 'Ghost' });
    expect(ghost).toBeChecked();
    await userEvent.click(ghost);
    expect(saved().ghost).toBe(false);
    expect(ghost).not.toBeChecked();
  });

  test('a theme is applied at once, and saved', async () => {
    const { saved } = settingsForm();
    const themes = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(themes).getByRole('radio', { name: 'Indigo' })).toBeChecked();
    await userEvent.click(within(themes).getByRole('radio', { name: 'Plum' }));
    expect(saved().theme).toBe('plum');
    expect(document.documentElement.style.getPropertyValue('--color-background')).toBe(
      'rgb(42 11 42)',
    );
  });

  test('a skin is saved', async () => {
    const { saved } = settingsForm();
    const skins = screen.getByRole('radiogroup', { name: 'Skin' });
    expect(within(skins).getByRole('radio', { name: 'Pixel' })).toBeChecked();
    await userEvent.click(within(skins).getByRole('radio', { name: 'Outline' }));
    expect(saved().skin).toBe('outline');
  });
});

describe('effects', () => {
  const effects = () => screen.getByRole('radiogroup', { name: 'Effects' });

  test('while unset, shows what the system resolves it to', () => {
    setMedia(REDUCE, true);
    settingsForm();
    expect(within(effects()).getByRole('radio', { name: /Reduced/ })).toBeChecked();
    expect(screen.getByText(/Following your system: Reduced/)).toBeInTheDocument();
    act(() => setMedia(REDUCE, false));
    expect(within(effects()).getByRole('radio', { name: /Full/ })).toBeChecked();
    expect(screen.getByText(/Following your system: Full/)).toBeInTheDocument();
  });

  test('a choice is saved, and no longer follows the system', async () => {
    const { saved } = settingsForm();
    await userEvent.click(within(effects()).getByRole('radio', { name: /Off/ }));
    expect(saved().effects).toBe('off');
    expect(screen.queryByText(/Following your system/)).not.toBeInTheDocument();
  });
});

describe('volume', () => {
  test('goes from 0 to 100 in steps of 10, and a change is saved', () => {
    const { saved } = settingsForm();
    expect(slider('Volume')).toHaveAttribute('aria-valuetext', '50');
    fireEvent.change(slider('Volume'), { target: { value: '7' } });
    expect(saved().volume).toBe(70);
    fireEvent.change(slider('Volume'), { target: { value: '0' } });
    expect(saved().volume).toBe(0);
    expect(slider('Volume')).toHaveAttribute('aria-valuetext', 'off');
  });
});

describe('leaving and saving', () => {
  test('Esc leaves', async () => {
    const { onClose } = settingsForm();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  test('Esc while a key is awaited cancels the key, not the screen', async () => {
    const { onClose } = settingsForm();
    await userEvent.click(keyButton('Hold: C'));
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(keyButton('Hold: C')).toBeInTheDocument();
  });

  test('Back leaves too', async () => {
    const { onClose } = settingsForm();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test('a save that fails says why, and the change still holds', async () => {
    const { storage, stores } = settingsForm();
    vi.spyOn(storage, 'write').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    await userEvent.click(screen.getByRole('switch', { name: 'Ghost' }));
    expect(message()).toHaveTextContent("Couldn't save the settings: quota exceeded");
    expect(stores.settings.getState().ghost).toBe(false);
  });

  test('Tab reaches every control, from the keyboard alone', async () => {
    settingsForm();
    const reached = new Set<Element | null>();
    for (let at = 0; at < 40; at++) {
      reached.add(document.activeElement);
      await userEvent.tab();
    }
    const radio = (group: string, name: string) =>
      within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name });
    for (const control of [
      slider('DAS'),
      slider('ARR'),
      slider('Soft drop factor'),
      keyButton('Hold: C'),
      keyButton('Hold: add a key'),
      screen.getByRole('button', { name: 'Reset keys' }),
      screen.getByRole('switch', { name: 'Ghost' }),
      radio('Theme', 'Indigo'),
      radio('Skin', 'Pixel'),
      radio('Effects', 'Full'),
      slider('Volume'),
      screen.getByRole('button', { name: 'Back' }),
    ]) {
      expect(reached).toContain(control);
    }
  });

  test('the first control has the focus, so the keys work at once', () => {
    settingsForm();
    expect(slider('DAS')).toHaveFocus();
  });
});
