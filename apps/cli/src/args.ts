import { parseArgs } from 'node:util';

export type Command = { kind: 'help' } | { kind: 'version' } | { kind: 'error'; message: string };

export const HELP = `Usage: shura [command]

Commands are not implemented yet (docs/design.md §13.3).

Options:
  -h, --help     show this help
  -v, --version  print the version`;

export const parseCommand = (argv: string[]): Command => {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      allowPositionals: true,
    });
    if (values.version) return { kind: 'version' };
    return { kind: 'help' };
  } catch (error) {
    return { kind: 'error', message: (error as Error).message };
  }
};
