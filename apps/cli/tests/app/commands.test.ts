import { describe, expect, test } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
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
  const code = await runCommand(argv, io);
  return { code, out: out.join(''), err: err.join(''), played };
}

const DEFAULTS = { noColor: false, input: 'auto', debugInput: false } as const;
const HELP = (await shura('--help')).out;

describe('help and version', () => {
  test('--help and -h print the help', async () => {
    expect(HELP).toMatch(/^Usage: shura \[command\] \[options\]/);
    expect(await shura('-h')).toMatchObject({ code: 0, out: HELP, err: '', played: [] });
  });

  test('--version and -v print the version', async () => {
    for (const flag of ['--version', '-v']) {
      expect(await shura(flag)).toMatchObject({ code: 0, out: `${pkg.version}\n`, played: [] });
    }
  });

  test('the help lists every command', () => {
    expect(HELP).toMatch(/opens the menu: Play online, Single player, Settings,\s+Quit/);
    for (const command of ['solo <mode>', 'quick', 'create [options]', 'join <CODE>']) {
      expect(HELP, command).toMatch(
        new RegExp(`^ {2}${command.replace(/[[\]]/g, '\\$&')} +\\w`, 'm'),
      );
    }
  });

  test('the help lists every flag but the hidden --debug-input', () => {
    for (const flag of [
      '--server <url>',
      '--name <nickname>',
      '--input <adapter>',
      '--no-color',
      '-h, --help',
      '-v, --version',
    ]) {
      expect(HELP).toContain(flag);
    }
    expect(HELP).toMatch(/"precise", "basic"/);
    expect(HELP).not.toContain('--debug-input');
  });

  test("the help says the online parts aren't available yet", () => {
    expect(HELP).toMatch(/online play isn't available yet/i);
  });

  test('shura solo --help lists every mode', async () => {
    const { code, out } = await shura('solo', '--help');
    expect(code).toBe(0);
    expect(out).toMatch(/^ {2}sprint +clear 40 lines/m);
    expect(out).toMatch(/^ {2}marathon +15 levels/m);
    expect(out).toMatch(/^ {2}ultra +score as much as you can in 2 minutes/m);
    expect(out).toContain('--no-color');
    expect(out).not.toContain('--debug-input');
  });

  test('shura create --help shows --mode', async () => {
    expect((await shura('create', '--help')).out).toMatch(/--mode <mode> .*"1v1", "ffa"/);
  });

  test('every help fits 80 columns', async () => {
    for (const argv of [[], ['solo'], ['quick'], ['create'], ['join']]) {
      for (const line of (await shura(...argv, '--help')).out.split('\n')) {
        expect(line.length, line).toBeLessThanOrEqual(80);
      }
    }
  });
});

describe('mistakes', () => {
  test('say what was wrong, then the help, and exit with 2', async () => {
    const run = await shura('nope');
    expect(run).toMatchObject({ code: 2, out: '', played: [] });
    expect(run.err).toBe(`error: unknown command 'nope'\n\n${HELP}`);
  });

  test('a mistake in a command shows that command’s help', async () => {
    const run = await shura('join');
    expect(run.code).toBe(2);
    expect(run.err).toMatch(/^error: missing required argument 'CODE'\n\nUsage: shura join/);
  });

  test('unknown options are one', async () => {
    expect((await shura('--nope')).code).toBe(2);
    expect((await shura('solo', 'sprint', '--nope')).code).toBe(2);
  });
});

describe('the online commands, until online play exists (M4)', () => {
  test.each([
    ['quick'],
    ['create'],
    ['create', '--mode', 'ffa'],
    ['create', '--mode=1v1'],
    ['--mode', 'ffa', 'create'],
    ['join', 'K7QX'],
    ['join', 'k7qx', '--server', 'wss://example.org', '--name', 'Or'],
    ['join', 'K7QXRT'],
  ])('shura %s says so and exits with 1', async (...argv) => {
    const run = await shura(...argv);
    expect(run.code).toBe(1);
    expect(run.err).toBe("online play isn't available yet\n");
    expect(run.out).toBe('');
    expect(run.played).toEqual([]);
  });

  test('quick takes nothing more', async () => {
    expect((await shura('quick', 'now')).code).toBe(2);
  });

  test('create takes only --mode 1v1 or ffa', async () => {
    expect((await shura('create', '--mode', 'br')).code).toBe(2);
    expect((await shura('create', '--mode')).code).toBe(2);
    expect((await shura('create', 'room')).code).toBe(2);
  });

  test('--mode goes only with create', async () => {
    expect((await shura('quick', '--mode', 'ffa')).code).toBe(2);
    expect((await shura('solo', 'sprint', '--mode', 'ffa')).code).toBe(2);
    expect((await shura('--mode', 'ffa')).code).toBe(2);
  });

  test('join without exactly one valid code is a mistake (design §10.3)', async () => {
    for (const argv of [[], ['K7QX', 'K7QX'], ['K7Q'], ['K7QXR'], ['K0QX'], ['KLQX']]) {
      // 0, O, 1, I and L are left out of codes, as easy to mistake.
      expect((await shura('join', ...argv)).code, argv.join(' ')).toBe(2);
    }
    expect((await shura('join', 'K7Q')).err).toMatch(/4 or 6 letters and digits, like K7QX/);
  });
});

describe('global flags', () => {
  test.each([
    [['--server', 'wss://example.org', '--name', 'Or'], DEFAULTS],
    [['--input', 'basic', '--no-color'], { ...DEFAULTS, input: 'basic', noColor: true }],
  ] as const)('%j go with every command, before or after it', async (flags, options) => {
    for (const argv of [['quick'], ['create'], ['join', 'K7QX']]) {
      expect((await shura(...argv, ...flags)).code).toBe(1);
      expect((await shura(...flags, ...argv)).code).toBe(1);
    }
    expect((await shura(...flags)).played).toEqual([options]);
    expect((await shura('solo', 'sprint', ...flags)).played).toEqual([
      { mode: 'sprint', ...options },
    ]);
    expect((await shura(...flags, 'solo', 'sprint')).played).toEqual([
      { mode: 'sprint', ...options },
    ]);
  });

  test('--server and --name need a value', async () => {
    expect((await shura('--server')).code).toBe(2);
    expect((await shura('quick', '--name')).code).toBe(2);
  });
});

describe('the interactive commands', () => {
  test('shura opens the menu', async () => {
    expect(await shura()).toMatchObject({ code: 0, played: [DEFAULTS] });
  });

  test.each(['sprint', 'marathon', 'ultra'] as const)(
    'shura solo %s opens on that game',
    async (mode) => {
      expect((await shura('solo', mode)).played).toEqual([{ mode, ...DEFAULTS }]);
    },
  );

  test('solo needs one known mode', async () => {
    expect((await shura('solo')).code).toBe(2);
    expect((await shura('solo', 'tetris')).code).toBe(2);
    expect((await shura('solo', 'sprint', 'extra')).code).toBe(2);
  });

  test('--input precise|basic fixes the input adapter (design §7.3)', async () => {
    expect((await shura('solo', 'ultra', '--input', 'basic')).played).toEqual([
      { mode: 'ultra', ...DEFAULTS, input: 'basic' },
    ]);
    expect((await shura('--input=precise', 'solo', 'sprint')).played).toEqual([
      { mode: 'sprint', ...DEFAULTS, input: 'precise' },
    ]);
  });

  test('--input takes only precise or basic', async () => {
    expect((await shura('solo', 'sprint', '--input', 'kitty')).code).toBe(2);
    expect((await shura('solo', 'sprint', '--input', 'auto')).code).toBe(2);
  });

  test('the hidden --debug-input shows the input panel, with shura and shura solo', async () => {
    expect((await shura('solo', 'sprint', '--debug-input')).played).toEqual([
      { mode: 'sprint', ...DEFAULTS, debugInput: true },
    ]);
    expect((await shura('--debug-input')).played).toEqual([{ ...DEFAULTS, debugInput: true }]);
  });

  test('the app’s exit code is the command’s', async () => {
    const io: CommandIO = { out: () => {}, err: () => {}, play: async () => 1 };
    expect(await runCommand([], io)).toBe(1);
  });
});
