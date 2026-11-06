import {
  Argument,
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from '@commander-js/extra-typings';
import { SOLO_MODES, type SoloMode } from '@shura/client-core';
import { parseRoomCode, ROOM_CODE_LENGTH } from '@shura/protocol';
import pkg from '../../package.json' with { type: 'json' };
import type { InputChoice } from '../platform/input/input-adapter';
import type { OnlineStart } from '../screens/online/online-start';

/** The adapters `--input` can fix; without it the CLI chooses (design §7.3). */
const FIXED_INPUTS = ['precise', 'basic'] as const satisfies readonly InputChoice[];

/** The online modes a room can play (design §4); `shura create` makes a 1v1 room by default. */
const ROOM_MODES = ['1v1', 'ffa'] as const;

/** What each solo mode is, for `shura solo --help`. */
const SOLO_MODE_HELP: Readonly<Record<SoloMode, string>> = {
  sprint: 'clear 40 lines as fast as you can',
  marathon: '15 levels, faster each 10 lines, to 150 lines',
  ultra: 'score as much as you can in 2 minutes',
};

/**
 * What the terminal app opens with: the main menu, straight on a game of `mode`, or straight on a
 * room, and the global options that change it.
 */
export interface PlayOptions {
  /** `shura solo <mode>`; without it the app opens on the main menu. */
  readonly mode?: SoloMode;
  /** `shura quick`, `shura create` or `shura join <CODE>`. */
  readonly online?: OnlineStart;
  /** `--server`: the server for online play, over `SHURA_SERVER` and the config (design §13.3). */
  readonly server?: string;
  /** `--name`: the nickname for this run, not saved (design §13.1). */
  readonly name?: string;
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

/** A room code as the protocol parses it (design §10.3): 4 letters and digits, any case. */
const roomCode = (code: string): string => {
  const parsed = parseRoomCode(code);
  if (parsed === undefined) {
    throw new InvalidArgumentError(
      `A room code is ${ROOM_CODE_LENGTH} letters and digits, like K7QX.`,
    );
  }
  return parsed;
};

/**
 * Runs `shura <argv>` (design §13.3) and returns the exit code: 0 for help and the version, the
 * app's own for the menu, `solo`, `quick`, `create` and `join`, and 2 for a mistake in the
 * arguments, which prints what was wrong and the help. Every flag goes before or after the command,
 * and `--mode` goes only with `create`.
 */
export async function runCommand(argv: readonly string[], io: CommandIO): Promise<number> {
  let code = 0;

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
    });

  const playOptions = ({
    color,
    input,
    debugInput,
    server,
    name,
  }: ReturnType<typeof program.opts>): PlayOptions => ({
    noColor: !color,
    input: input ?? 'auto',
    debugInput,
    ...(server !== undefined && { server }),
    ...(name !== undefined && { name }),
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
  program
    .command('quick')
    .description('join the 1v1 quick-match queue')
    .action(async (_options, command) => {
      const online: OnlineStart = { action: 'quick' };
      code = await io.play({ ...playOptions(command.optsWithGlobals()), online });
    });
  program
    .command('create')
    .description('create a room (1v1 unless --mode ffa) and print its code and link')
    // Only for the help: the program's own `--mode` takes the value, wherever it is.
    .addOption(new Option('--mode <mode>', "the room's mode").choices(ROOM_MODES))
    .action(async (_options, command) => {
      const options = command.optsWithGlobals();
      const online: OnlineStart = { action: 'create', mode: options.mode ?? '1v1' };
      code = await io.play({ ...playOptions(options), online });
    });
  program
    .command('join')
    .description('join a room by its code')
    .addArgument(
      new Argument('<CODE>', `the room code: ${ROOM_CODE_LENGTH} letters and digits`).argParser(
        roomCode,
      ),
    )
    .action(async (room, _options, command) => {
      const online: OnlineStart = { action: 'join', code: room };
      code = await io.play({ ...playOptions(command.optsWithGlobals()), online });
    });

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
