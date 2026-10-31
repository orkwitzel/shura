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
    });
  });

  test.each(['marathon', 'ultra'] as const)('solo %s plays that mode', (mode) => {
    expect(parseCommand(['solo', mode])).toEqual({ kind: 'solo', mode, noColor: false });
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
    });
    expect(parseCommand(['solo', 'sprint', '--no-color'])).toMatchObject({ noColor: true });
  });

  test('a missing or unknown mode is an error', () => {
    expect(parseCommand(['solo']).kind).toBe('error');
    expect(parseCommand(['solo', 'tetris']).kind).toBe('error');
    expect(parseCommand(['solo', 'sprint', 'extra']).kind).toBe('error');
  });
});
