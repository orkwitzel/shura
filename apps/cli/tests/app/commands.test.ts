import { describe, expect, test } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { HELP, parseCommand } from '../../src/app/args';
import { type CommandIO, type PlayOptions, runCommand } from '../../src/app/commands';

/** Runs `shura <argv>` with its output and the terminal app recorded instead. */
async function shura(...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const played: PlayOptions[] = [];
  const io: CommandIO = {
    out: (text) => void out.push(text),
    err: (text) => void err.push(text),
    play: async (options) => {
      played.push(options);
      return 0;
    },
  };
  const code = await runCommand(parseCommand(argv), io);
  return { code, out: out.join('\n'), err: err.join('\n'), played };
}

describe('the online commands, until online play exists (M4)', () => {
  test.each([
    ['quick'],
    ['create'],
    ['create', '--mode', 'ffa'],
    ['join', 'K7QX'],
    ['join', 'k7qx', '--server', 'wss://example.org', '--name', 'Or'],
  ])('shura %s says so and exits with 1', async (...argv) => {
    const run = await shura(...argv);
    expect(run.code).toBe(1);
    expect(run.err).toBe("online play isn't available yet");
    expect(run.out).toBe('');
    expect(run.played).toEqual([]);
  });
});

describe('the interactive commands', () => {
  test('shura opens the menu', async () => {
    const run = await shura();
    expect(run.code).toBe(0);
    expect(run.played).toEqual([{ noColor: false, input: 'auto', debugInput: false }]);
  });

  test('shura solo <mode> opens straight on that game', async () => {
    const run = await shura('solo', 'ultra', '--input', 'basic', '--no-color');
    expect(run.played).toEqual([
      { mode: 'ultra', noColor: true, input: 'basic', debugInput: false },
    ]);
  });

  test('--server and --name have no effect', async () => {
    const run = await shura('solo', 'sprint', '--server', 'wss://example.org', '--name', 'Or');
    expect(run.played).toEqual([
      { mode: 'sprint', noColor: false, input: 'auto', debugInput: false },
    ]);
  });

  test('the app’s exit code is the command’s', async () => {
    const io: CommandIO = { out: () => {}, err: () => {}, play: async () => 1 };
    expect(await runCommand(parseCommand([]), io)).toBe(1);
  });
});

describe('help, version and mistakes', () => {
  test('--help prints the help', async () => {
    expect(await shura('--help')).toMatchObject({ code: 0, out: HELP, played: [] });
  });

  test('--version prints the version', async () => {
    expect(await shura('--version')).toMatchObject({ code: 0, out: pkg.version, played: [] });
  });

  test('a mistake says what it was, then the help, and exits with 2', async () => {
    const run = await shura('join');
    expect(run.code).toBe(2);
    expect(run.err).toMatch(/^shura join needs a room code/);
    expect(run.err).toContain(HELP);
    expect(run.played).toEqual([]);
  });
});
