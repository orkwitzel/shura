import { describe, expect, test } from 'vitest';
import { HELP, parseCommand } from '../src/args';

test('--version and -v print the version', () => {
  expect(parseCommand(['--version'])).toEqual({ kind: 'version' });
  expect(parseCommand(['-v'])).toEqual({ kind: 'version' });
});

test('no arguments shows help', () => {
  expect(parseCommand([])).toEqual({ kind: 'help' });
});

test('unknown options are an error', () => {
  expect(parseCommand(['--nope']).kind).toBe('error');
});

test('unknown commands are an error', () => {
  expect(parseCommand(['nope']).kind).toBe('error');
});

describe('solo', () => {
  test('solo sprint plays Sprint', () => {
    expect(parseCommand(['solo', 'sprint'])).toEqual({
      kind: 'solo',
      mode: 'sprint',
      noColor: false,
      input: 'auto',
      debugInput: false,
    });
  });

  test.each(['marathon', 'ultra'] as const)('solo %s plays that mode', (mode) => {
    expect(parseCommand(['solo', mode])).toEqual({
      kind: 'solo',
      mode,
      noColor: false,
      input: 'auto',
      debugInput: false,
    });
  });

  test('help lists every solo mode', () => {
    expect(HELP).toMatch(/solo marathon/);
    expect(HELP).toMatch(/solo sprint/);
    expect(HELP).toMatch(/solo ultra/);
  });

  test('--no-color goes anywhere', () => {
    expect(parseCommand(['--no-color', 'solo', 'sprint'])).toEqual({
      kind: 'solo',
      mode: 'sprint',
      noColor: true,
      input: 'auto',
      debugInput: false,
    });
    expect(parseCommand(['solo', 'sprint', '--no-color'])).toMatchObject({ noColor: true });
  });

  test('a missing or unknown mode is an error', () => {
    expect(parseCommand(['solo']).kind).toBe('error');
    expect(parseCommand(['solo', 'tetris']).kind).toBe('error');
    expect(parseCommand(['solo', 'sprint', 'extra']).kind).toBe('error');
  });

  test('--input precise|basic fixes the input adapter (design §7.3)', () => {
    expect(parseCommand(['solo', 'sprint', '--input', 'basic'])).toMatchObject({ input: 'basic' });
    expect(parseCommand(['--input=precise', 'solo', 'sprint'])).toMatchObject({
      input: 'precise',
    });
  });

  test('--input takes only precise or basic', () => {
    expect(parseCommand(['solo', 'sprint', '--input', 'kitty']).kind).toBe('error');
    expect(parseCommand(['solo', 'sprint', '--input', 'auto']).kind).toBe('error');
  });

  test('the hidden --debug-input shows the input panel', () => {
    expect(parseCommand(['solo', 'sprint', '--debug-input'])).toMatchObject({ debugInput: true });
    expect(HELP).not.toContain('--debug-input');
    expect(HELP).toContain('--input precise|basic');
  });
});
