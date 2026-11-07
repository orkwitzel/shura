import { afterEach, expect, it, vi } from 'vitest';
import { NicknamePrompt } from '../../src/components/nickname-prompt';
import { fakeClock } from '../support/fake-clock';
import { renderScreen } from '../support/fake-online-session';
import { KEYS } from '../support/solo-app';

let unmount: (() => void) | undefined;
afterEach(() => unmount?.());

const BACKSPACE = '\x7f';
/** Shift+A under the Kitty protocol's all-keys-as-escape-codes: `a`, with Shift. */
const SHIFT_A = '\x1b[97;2u';

async function prompt(initial = 'Player4821', fresh = true) {
  const onAccept = vi.fn();
  const onCancel = vi.fn();
  const screen = await renderScreen(
    <NicknamePrompt
      initial={initial}
      fresh={fresh}
      active
      clock={fakeClock()}
      onAccept={onAccept}
      onCancel={onCancel}
    />,
  );
  unmount = screen.app.unmount;
  return { ...screen, onAccept, onCancel };
}

it('is prefilled with a suggestion that Enter accepts', async () => {
  const { frame, type, onAccept } = await prompt();
  expect(frame()).toContain('NICKNAME');
  expect(frame()).toContain('Player4821');
  await type(KEYS.enter);
  expect(onAccept).toHaveBeenCalledWith('Player4821');
});

it('replaces the suggestion with what is typed, Shift giving capitals', async () => {
  const { frame, type, onAccept } = await prompt();
  await type(SHIFT_A, KEYS.letter('d'), KEYS.letter('a'));
  expect(frame()).toContain('Ada');
  expect(frame()).not.toContain('Player4821');
  await type(KEYS.enter);
  expect(onAccept).toHaveBeenCalledWith('Ada');
});

it('checks the nickname as it is typed, and Enter does nothing while it is invalid', async () => {
  const { frame, type, onAccept } = await prompt('Ada', false);
  await type(KEYS.letter('!'));
  expect(frame()).toContain('Letters, digits, spaces, _ and - only.');
  await type(KEYS.enter);
  expect(onAccept).not.toHaveBeenCalled();
  await type(BACKSPACE, BACKSPACE, BACKSPACE, BACKSPACE);
  expect(frame()).toContain('Type a nickname.');
  await type(KEYS.enter);
  expect(onAccept).not.toHaveBeenCalled();
});

it('keeps a nickname to 16 characters', async () => {
  const { frame, type } = await prompt('Abcdefghijklmnop', false);
  await type(KEYS.letter('q'));
  expect(frame()).toContain('Abcdefghijklmnop');
  expect(frame()).not.toContain('Abcdefghijklmnopq');
});

it('Esc cancels', async () => {
  const { type, onCancel, onAccept } = await prompt();
  await type(KEYS.escape);
  expect(onCancel).toHaveBeenCalled();
  expect(onAccept).not.toHaveBeenCalled();
});
