import { parseArgs } from 'node:util';
import type { SoloMode } from '@shura/client-core';
import type { InputChoice } from './input/detect';

/** The single-player modes `shura solo` plays. */
export const SOLO_MODES = ['sprint', 'marathon', 'ultra'] as const satisfies readonly SoloMode[];

/** The adapters `--input` can fix; without it the CLI chooses (design §7.3). */
const FIXED_INPUTS = ['precise', 'basic'] as const satisfies readonly InputChoice[];

/** The online modes a room can play (design §4); `shura create` makes a 1v1 room by default. */
export const ROOM_MODES = ['1v1', 'ffa'] as const;
export type RoomMode = (typeof ROOM_MODES)[number];

/**
 * A room code (design §10.3): 4 characters, or 6 for a private room, from the letters and digits
 * without 0, O, 1, I and L.
 */
const ROOM_CODE = /^[2-9A-HJKMNP-Z]{4}([2-9A-HJKMNP-Z]{2})?$/;

/** The options every command takes (design §13.3). */
export interface GlobalOptions {
  readonly noColor: boolean;
  /** The input adapter: `auto` unless `--input` fixes it (design §7.3). */
  readonly input: InputChoice;
  /** The hidden `--debug-input`: the input panel, and a capture file of the keys. */
  readonly debugInput: boolean;
  /** `--server <url>`: parsed, but no effect until online play exists (M4). */
  readonly server?: string;
  /** `--name <nickname>`: parsed, but no effect until online play exists (M4). */
  readonly name?: string;
}

export type Command =
  | { kind: 'help' }
  | { kind: 'version' }
  /** `shura` on its own: the interactive menu. */
  | ({ kind: 'menu' } & GlobalOptions)
  | ({ kind: 'solo'; mode: SoloMode } & GlobalOptions)
  /** The online commands: they parse, but online play isn't available yet (M4). */
  | ({ kind: 'quick' } & GlobalOptions)
  | ({ kind: 'create'; mode: RoomMode } & GlobalOptions)
  | ({ kind: 'join'; code: string } & GlobalOptions)
  | { kind: 'error'; message: string };

export const HELP = `Usage: shura [command] [options]

Commands:
  shura                    the menu: Play online, Single player, Settings, Quit
  shura solo sprint        play Sprint: clear 40 lines as fast as you can
  shura solo marathon      play Marathon: 15 levels, faster each 10 lines,
                           to 150 lines
  shura solo ultra         play Ultra: score as much as you can in 2 minutes
  shura quick              join the 1v1 quick-match queue
  shura create [--mode 1v1|ffa]
                           create a room (1v1 unless --mode ffa) and print
                           its code and link
  shura join <CODE>        join a room by its code

  Online play isn't available yet: quick, create and join exit with 1.

Options:
  --server <url>           the server for online play
  --name <nickname>        your nickname for online play
  --input precise|basic    how keys are read, instead of choosing from the
                           first key: precise for terminals with the Kitty
                           keyboard protocol, basic for any other
  --no-color               draw cells as characters instead of colour
                           (or set NO_COLOR)
  -h, --help               show this help
  -v, --version            print the version`;

export const parseCommand = (argv: string[]): Command => {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        'no-color': { type: 'boolean' },
        input: { type: 'string' },
        'debug-input': { type: 'boolean' },
        server: { type: 'string' },
        name: { type: 'string' },
        mode: { type: 'string' },
      },
      allowPositionals: true,
    });
    if (values.version) return { kind: 'version' };
    if (values.help) return { kind: 'help' };
    const input = values.input ?? 'auto';
    if (values.input !== undefined && !FIXED_INPUTS.some((known) => known === input)) {
      return { kind: 'error', message: `--input takes ${FIXED_INPUTS.join(' or ')}` };
    }
    const options: GlobalOptions = {
      noColor: values['no-color'] ?? false,
      input: input as InputChoice,
      debugInput: values['debug-input'] ?? false,
      ...(values.server !== undefined && { server: values.server }),
      ...(values.name !== undefined && { name: values.name }),
    };
    const [command, ...rest] = positionals;
    if (command !== 'create' && values.mode !== undefined) {
      return { kind: 'error', message: '--mode goes only with create' };
    }
    const unexpected = (extra: readonly string[]): Command | undefined =>
      extra.length > 0 ? { kind: 'error', message: `Unexpected '${extra.join(' ')}'` } : undefined;
    switch (command) {
      case undefined:
        return { kind: 'menu', ...options };
      case 'solo': {
        const [mode, ...extra] = rest;
        if (!SOLO_MODES.some((known) => known === mode)) {
          return { kind: 'error', message: `shura solo needs a mode: ${SOLO_MODES.join(', ')}` };
        }
        return unexpected(extra) ?? { kind: 'solo', mode: mode as SoloMode, ...options };
      }
      case 'quick':
        return unexpected(rest) ?? { kind: 'quick', ...options };
      case 'create': {
        const mode = values.mode ?? '1v1';
        if (!ROOM_MODES.some((known) => known === mode)) {
          return { kind: 'error', message: `--mode takes ${ROOM_MODES.join(' or ')}` };
        }
        return unexpected(rest) ?? { kind: 'create', mode: mode as RoomMode, ...options };
      }
      case 'join': {
        const [code, ...extra] = rest;
        const upper = code?.toUpperCase() ?? '';
        if (!ROOM_CODE.test(upper)) {
          return {
            kind: 'error',
            message: 'shura join needs a room code: 4 or 6 letters and digits, like K7QX',
          };
        }
        return unexpected(extra) ?? { kind: 'join', code: upper, ...options };
      }
      default:
        return { kind: 'error', message: `Unknown command '${command}'` };
    }
  } catch (error) {
    return { kind: 'error', message: (error as Error).message };
  }
};
