import { expect, test } from 'vitest';
import { parseCommand } from '../src/args';

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
