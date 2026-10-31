import { describe, expect, test } from 'vitest';
import { keyLabel } from '@/lib/keyboard/key-labels';

describe('keyLabel', () => {
  test.each([
    ['KeyX', 'X'],
    ['Digit7', '7'],
    ['ArrowLeft', '←'],
    ['ArrowRight', '→'],
    ['ArrowUp', '↑'],
    ['ArrowDown', '↓'],
    ['Space', 'Space'],
    ['ControlLeft', 'Left Ctrl'],
    ['ControlRight', 'Right Ctrl'],
    ['ShiftLeft', 'Left Shift'],
    ['AltRight', 'Right Alt'],
    ['MetaLeft', 'Left Meta'],
    ['Numpad4', 'Num 4'],
    ['NumpadAdd', 'Num +'],
    ['Semicolon', ';'],
    ['BracketLeft', '['],
    ['Backquote', '`'],
    ['Enter', 'Enter'],
    ['Escape', 'Esc'],
    ['F5', 'F5'],
  ])('names %s as %s', (code, name) => {
    expect(keyLabel(code)).toBe(name);
  });

  test('names a key it does not know by its code', () => {
    expect(keyLabel('IntlRo')).toBe('IntlRo');
  });
});
