import {
  Argument,
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from '@commander-js/extra-typings';
import { SOLO_MODES, type SoloMode } from '@shura/client-core';
import pkg from '../../package.json' with { type: 'json' };
import type { InputChoice } from '../platform/input/detect';

/** The adapters `--input` can fix; without it the CLI chooses (design §7.3). */
const FIXED_INPUTS = ['precise', 'basic'] as const satisfies readonly InputChoice[];

/** The online modes a room can play (design §4); `shura create` makes a 1v1 room by default. */
const ROOM_MODES = ['1v1', 'ffa'] as const;

/**
 * A room code (design §10.3): 4 characters, or 6 for a private room, from the letters and digits
 * without 0, O, 1, I and L.
 */
const ROOM_CODE = /^[2-9A-HJKMNP-Z]{4}([2-9A-HJKMNP-Z]{2})?$/;

/** What each solo mode is, for `shura solo --help`. */
const SOLO_MODE_HELP: Readonly<Record<SoloMode, string>> = {
  sprint: 'clear 40 lines as fast as you can',
  marathon: '15 levels, faster each 10 lines, to 150 lines',
  ultra: 'score as much as you can in 2 minutes',
};

/**
 * What the terminal app opens with: the main menu, or straight on a game of `mode`, and the global
 * options that change it (`--server` and `--name` don't yet).
 */
export interface PlayOptions {
  /** `shura solo <mode>`; without it the app opens on the main menu. */
  readonly mode?: SoloMode;
  readonly noColor: boolean;
  /** The input adapter: `auto` unless `--input` fixes it (design §7.3). */
  readonly input: InputChoice;
  /** The hidden `--debug-input`: the input panel, and a capture file of the keys. */
  readonly debugInput: boolean;
}

/**
 * Where a command's output goes (text as it is printed, newlines included), and how it starts the
 * terminal app (returning its exit code).
 */
export interface CommandIO {
  out(text: string): void;
  err(text: string): void;
  play(options: PlayOptions): Promise<number>;
}

const roomCode = (code: string): string => {
  const upper = code.toUpperCase();
  if (!ROOM_CODE.test(upper)) {
    throw new InvalidArgumentError('A room code is 4 or 6 letters and digits, like K7QX.');
  }
  return upper;
};

/**
 * Runs `shura <argv>` (design §13.3) and returns the exit code: 0 for help and the version, the
 * app's own for the menu and `solo`, 1 for the online commands until online play exists (M4), and
 * 2 for a mistake in the arguments, which prints what was wrong and the help. Every flag goes
 * before or after the command, and `--mode` goes only with `create`. `--server` and `--name` are
 * parsed but not used yet.
 */
export async function runCommand(argv: readonly string[], io: CommandIO): Promise<number> {
  let code = 0;
  const offline = () => {
    io.err("online play isn't available yet\n");
    code = 1;
  };

  // Set before the commands are added: each command copies them from the program.
  const program = new Command()
    .name('shura')
    .usage('[command] [options]')
    .description(
      'Without a command, shura opens the menu: Play online, Single player, Settings, Quit.',
    )
    .configureOutput({ writeOut: io.out, writeErr: io.err })
    .configureHelp({ helpWidth: 80, showGlobalOptions: true })
    .exitOverride()
    .showHelpAfterError()
    .helpCommand(false)
    .helpOption('-h, --help', 'show this help')
    .option('--server <url>', 'the server for online play')
    .option('--name <nickname>', 'your nickname for online play')
    .addOption(
      new Option(
        '--input <adapter>',
        'how keys are read, instead of choosing from the first key: precise for terminals with ' +
          'the Kitty keyboard protocol, basic for any other',
      ).choices(FIXED_INPUTS),
    )
    .option('--no-color', 'draw cells as characters instead of colour (or set NO_COLOR)')
    .version(pkg.version, '-v, --version', 'print the version')
    .addOption(new Option('--debug-input').default(false).hideHelp())
    // `--mode` is `create`'s, but like every flag it may come before the command too: the program
    // takes it wherever it is, and refuses it with any other command.
    .addOption(new Option('--mode <mode>').choices(ROOM_MODES).hideHelp())
    .hook('preAction', (program, command) => {
      if (program.opts().mode !== undefined && command.name() !== 'create') {
        command.error('error: --mode goes only with create');
      }
    })
    .addHelpText('after', "\nOnline play isn't available yet: quick, create and join exit with 1.");

  const playOptions = ({
    color,
    input,
    debugInput,
  }: ReturnType<typeof program.opts>): PlayOptions => ({
    noColor: !color,
    input: input ?? 'auto',
    debugInput,
  });

  program
    .command('solo')
    .description('play a single-player game: sprint, marathon or ultra')
    .addArgument(new Argument('<mode>', 'the mode to play').choices(SOLO_MODES))
    .addHelpText(
      'after',
      `\nModes:\n${SOLO_MODES.map((mode) => `  ${mode.padEnd(10)}${SOLO_MODE_HELP[mode]}`).join('\n')}`,
    )
    .action(async (mode, _options, command) => {
      code = await io.play({ mode, ...playOptions(command.optsWithGlobals()) });
    });
  program.command('quick').description('join the 1v1 quick-match queue').action(offline);
  program
    .command('create')
    .description('create a room (1v1 unless --mode ffa) and print its code and link')
    // Only for the help: the program's own `--mode` takes the value, wherever it is.
    .addOption(new Option('--mode <mode>', "the room's mode").choices(ROOM_MODES))
    .action(offline);
  program
    .command('join')
    .description('join a room by its code')
    .addArgument(
      new Argument('<CODE>', 'the room code: 4 or 6 letters and digits').argParser(roomCode),
    )
    .action(offline);

  // `shura` on its own opens the menu. The program takes words only so that an unknown command
  // gets its own message; each command above still refuses words it doesn't take.
  program.allowExcessArguments().action(async (options, command) => {
    const [unknown] = command.args;
    if (unknown !== undefined) command.error(`error: unknown command '${unknown}'`);
    code = await io.play(playOptions(options));
  });

  try {
    await program.parseAsync(argv, { from: 'user' });
    return code;
  } catch (error) {
    if (!(error instanceof CommanderError)) throw error;
    return error.exitCode === 0 ? 0 : 2;
  }
}
