import { parseArgs } from 'node:util';
import type { SoloMode } from '@shura/client-core';
import type { InputChoice } from './input/detect';

/** The single-player modes `shura solo` plays. */
export const SOLO_MODES = ['sprint'] as const satisfies readonly SoloMode[];

/** The adapters `--input` can fix; without it the CLI chooses (design §7.3). */
const FIXED_INPUTS = ['precise', 'basic'] as const satisfies readonly InputChoice[];

export type Command =
  | { kind: 'help' }
  | { kind: 'version' }
  | {
      kind: 'solo';
      mode: SoloMode;
      noColor: boolean;
      /** The input adapter: `auto` unless `--input` fixes it (design §7.3). */
      input: InputChoice;
      /** The hidden `--debug-input`: the input panel, and a capture file of the keys. */
      debugInput: boolean;
    }
  | { kind: 'error'; message: string };

export const HELP = `Usage: shura [command] [options]

Commands:
  solo sprint    play Sprint: clear 40 lines as fast as you can

Options:
  --input precise|basic
                 how keys are read, instead of choosing from the first key:
                 precise for terminals with the Kitty keyboard protocol, basic otherwise
  --no-color     draw cells as characters instead of colour (or set NO_COLOR)
  -h, --help     show this help
  -v, --version  print the version`;

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
      },
      allowPositionals: true,
    });
    if (values.version) return { kind: 'version' };
    if (values.help) return { kind: 'help' };
    const [command, ...rest] = positionals;
    if (command === undefined) return { kind: 'help' };
    if (command !== 'solo') return { kind: 'error', message: `Unknown command '${command}'` };
    const [mode, ...extra] = rest;
    if (!SOLO_MODES.some((known) => known === mode)) {
      return { kind: 'error', message: `shura solo needs a mode: ${SOLO_MODES.join(', ')}` };
    }
    if (extra.length > 0) return { kind: 'error', message: `Unexpected '${extra.join(' ')}'` };
    const input = values.input ?? 'auto';
    if (values.input !== undefined && !FIXED_INPUTS.some((known) => known === input)) {
      return { kind: 'error', message: `--input takes ${FIXED_INPUTS.join(' or ')}` };
    }
    return {
      kind: 'solo',
      mode: mode as SoloMode,
      noColor: values['no-color'] ?? false,
      input: input as InputChoice,
      debugInput: values['debug-input'] ?? false,
    };
  } catch (error) {
    return { kind: 'error', message: (error as Error).message };
  }
};
