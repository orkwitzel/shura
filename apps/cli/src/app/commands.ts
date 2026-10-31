import type { SoloMode } from '@shura/client-core';
import pkg from '../../package.json' with { type: 'json' };
import { type Command, type GlobalOptions, HELP } from './args';

/**
 * What the terminal app opens with: the main menu, or straight on a game of `mode`, and the global
 * options that change it (`--server` and `--name` don't yet).
 */
export interface PlayOptions extends Pick<GlobalOptions, 'noColor' | 'input' | 'debugInput'> {
  /** `shura solo <mode>`; without it the app opens on the main menu. */
  readonly mode?: SoloMode;
}

/** Where a command's output goes, and how it starts the terminal app (returning its exit code). */
export interface CommandIO {
  out(text: string): void;
  err(text: string): void;
  play(options: PlayOptions): Promise<number>;
}

/**
 * Runs a parsed command (design §13.3) and returns the exit code: 0 for help and the version, the
 * app's own for the menu and `solo`, 1 for the online commands until online play exists (M4), and
 * 2 for a mistake in the arguments. `--server` and `--name` are parsed but not used yet.
 */
export async function runCommand(command: Command, io: CommandIO): Promise<number> {
  switch (command.kind) {
    case 'version':
      io.out(pkg.version);
      return 0;
    case 'help':
      io.out(HELP);
      return 0;
    case 'menu':
    case 'solo': {
      const { noColor, input, debugInput } = command;
      return io.play({
        ...(command.kind === 'solo' && { mode: command.mode }),
        noColor,
        input,
        debugInput,
      });
    }
    case 'quick':
    case 'create':
    case 'join':
      io.err("online play isn't available yet");
      return 1;
    case 'error':
      io.err(`${command.message}\n\n${HELP}`);
      return 2;
  }
}
