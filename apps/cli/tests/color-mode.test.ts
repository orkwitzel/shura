import { expect, test } from 'vitest';
import { detectColorMode } from '../src/render/color-mode';

test('24-bit colour when the terminal says it has it', () => {
  expect(detectColorMode(false, { COLORTERM: 'truecolor' })).toBe('truecolor');
  expect(detectColorMode(false, { COLORTERM: '24bit' })).toBe('truecolor');
});

test('the 16 ANSI colours otherwise', () => {
  expect(detectColorMode(false, {})).toBe('ansi16');
  expect(detectColorMode(false, { COLORTERM: 'yes' })).toBe('ansi16');
});

test('glyphs with --no-color, or NO_COLOR set to anything but empty (no-color.org)', () => {
  expect(detectColorMode(true, { COLORTERM: 'truecolor' })).toBe('none');
  expect(detectColorMode(false, { COLORTERM: 'truecolor', NO_COLOR: '1' })).toBe('none');
  expect(detectColorMode(false, { NO_COLOR: '' })).toBe('ansi16');
});
