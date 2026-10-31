import { describe, expect, test } from 'vitest';
import { HELP, parseCommand } from '../src/args';

test('--version and -v print the version', () => {
  expect(parseCommand(['--version'])).toEqual({ kind: 'version' });
  expect(parseCommand(['-v'])).toEqual({ kind: 'version' });
});

test('no arguments opens the menu', () => {
  expect(parseCommand([])).toEqual({
    kind: 'menu',
    noColor: false,
    input: 'auto',
    debugInput: false,
  });
});

test('unknown options are an error', () => {
  expect(parseCommand(['--nope']).kind).toBe('error');
});

test('unknown commands are an error', () => {
  expect(parseCommand(['nope']).kind).toBe('error');
});

describe('--help', () => {
  test('lists every command', () => {
    const lines = HELP.split('\n').map((line) => line.trimEnd());
    const listed = (command: string) =>
      lines.some((line) => line === `  ${command}` || line.startsWith(`  ${command}  `));
    expect(HELP).toMatch(/^ {2}shura +the menu/m);
    for (const command of [
      'solo sprint',
      'solo marathon',
      'solo ultra',
      'quick',
      'create [--mode 1v1|ffa]',
      'join <CODE>',
    ]) {
      expect(listed(`shura ${command}`), command).toBe(true);
    }
  });

  test('lists every flag but the hidden --debug-input', () => {
    for (const flag of [
      '--server <url>',
      '--name <nickname>',
      '--input precise|basic',
      '--no-color',
      '--help',
      '--version',
    ]) {
      expect(HELP).toContain(flag);
    }
    expect(HELP).not.toContain('--debug-input');
  });

  test("says the online parts aren't available yet", () => {
    expect(HELP).toMatch(/online play isn't available yet/i);
  });

  test('fits 80 columns', () => {
    for (const line of HELP.split('\n')) expect(line.length).toBeLessThanOrEqual(80);
  });
});

const DEFAULTS = { noColor: false, input: 'auto', debugInput: false } as const;

describe('online commands (stubs until M4)', () => {
  test('quick joins the quick-match queue', () => {
    expect(parseCommand(['quick'])).toEqual({ kind: 'quick', ...DEFAULTS });
    expect(parseCommand(['quick', 'now']).kind).toBe('error');
  });

  test('create makes a 1v1 room unless --mode says ffa', () => {
    expect(parseCommand(['create'])).toEqual({ kind: 'create', mode: '1v1', ...DEFAULTS });
    expect(parseCommand(['create', '--mode', 'ffa'])).toMatchObject({ mode: 'ffa' });
    expect(parseCommand(['create', '--mode=1v1'])).toMatchObject({ mode: '1v1' });
  });

  test('create takes only 1v1 or ffa', () => {
    expect(parseCommand(['create', '--mode', 'br']).kind).toBe('error');
    expect(parseCommand(['create', '--mode']).kind).toBe('error');
    expect(parseCommand(['create', 'room']).kind).toBe('error');
  });

  test('--mode goes only with create', () => {
    expect(parseCommand(['quick', '--mode', 'ffa']).kind).toBe('error');
    expect(parseCommand(['solo', 'sprint', '--mode', 'ffa']).kind).toBe('error');
    expect(parseCommand(['--mode', 'ffa']).kind).toBe('error');
  });

  test('join takes a room code, in either case (design §10.3)', () => {
    expect(parseCommand(['join', 'K7QX'])).toEqual({ kind: 'join', code: 'K7QX', ...DEFAULTS });
    expect(parseCommand(['join', 'k7qx'])).toMatchObject({ code: 'K7QX' });
    expect(parseCommand(['join', 'K7QXRT'])).toMatchObject({ code: 'K7QXRT' });
  });

  test('join without exactly one valid code is an error', () => {
    expect(parseCommand(['join']).kind).toBe('error');
    expect(parseCommand(['join', 'K7QX', 'K7QX']).kind).toBe('error');
    expect(parseCommand(['join', 'K7Q']).kind).toBe('error');
    expect(parseCommand(['join', 'K7QXR']).kind).toBe('error');
    // 0, O, 1, I and L are left out of codes, as easy to mistake.
    expect(parseCommand(['join', 'K0QX']).kind).toBe('error');
    expect(parseCommand(['join', 'KLQX']).kind).toBe('error');
  });
});

describe('global flags', () => {
  test('--server and --name parse on every command', () => {
    const flags = ['--server', 'wss://example.org', '--name', 'Or'];
    for (const argv of [[], ['solo', 'sprint'], ['quick'], ['create'], ['join', 'K7QX']]) {
      expect(parseCommand([...argv, ...flags])).toMatchObject({
        server: 'wss://example.org',
        name: 'Or',
      });
    }
  });

  test('--server and --name need a value', () => {
    expect(parseCommand(['--server']).kind).toBe('error');
    expect(parseCommand(['quick', '--name']).kind).toBe('error');
  });

  test('--input and --no-color go with every command', () => {
    for (const argv of [[], ['quick'], ['create'], ['join', 'K7QX']]) {
      expect(parseCommand([...argv, '--input', 'basic', '--no-color'])).toMatchObject({
        input: 'basic',
        noColor: true,
      });
    }
  });
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
