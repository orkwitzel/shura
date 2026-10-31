import { parseArgs } from 'node:util';
import type { SoloMode } from '@shura/client-core';

/** The single-player modes `shura solo` plays. */
export const SOLO_MODES = ['sprint', 'marathon', 'ultra'] as const satisfies readonly SoloMode[];

export type Command =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'solo'; mode: SoloMode; noColor: boolean }
  | { kind: 'error'; message: string };

export const HELP = `Usage: shura [command] [options]

Commands:
  solo sprint    play Sprint: clear 40 lines as fast as you can
  solo marathon  play Marathon: 15 levels, faster each 10 lines, to 150 lines
  solo ultra     play Ultra: score as much as you can in 2 minutes

Options:
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
    return { kind: 'solo', mode: mode as SoloMode, noColor: values['no-color'] ?? false };
  } catch (error) {
    return { kind: 'error', message: (error as Error).message };
  }
};
