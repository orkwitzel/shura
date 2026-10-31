import type { SoloMode } from '@shura/client-core';
import { type Instance, type KittyFlagName, type RenderOptions, render } from 'ink';
import type { ReactElement } from 'react';
import { terminalClock } from './clock';
import { detectColorMode } from './render/color-mode';
import { App } from './ui/app';

/**
 * The Kitty keyboard protocol flags the CLI asks for (design §7.3). Reporting all keys as escape
 * codes is what gives letter keys and Space their repeat and release events too: without it the
 * protocol sends them as plain text, so a held X would read as a stream of presses.
 */
export const KITTY_FLAGS: KittyFlagName[] = [
  'disambiguateEscapeCodes',
  'reportEventTypes',
  'reportAllKeysAsEscapeCodes',
];

/** Streams to draw on and read from instead of the process's own, for tests. */
export type TerminalStreams = Pick<
  RenderOptions,
  'stdin' | 'stdout' | 'stderr' | 'interactive' | 'patchConsole'
>;

/**
 * Takes over the terminal for `app`: the alternate screen, a hidden cursor, raw input and the Kitty
 * keyboard protocol when the terminal answers for it, drawn at about 30 fps (design §13.3).
 * Ctrl+C quits at once from anywhere; unmounting gives all of it back.
 */
export function startTerminalApp(app: ReactElement, streams: TerminalStreams = {}): Instance {
  return render(app, {
    kittyKeyboard: { mode: 'auto', flags: KITTY_FLAGS },
    alternateScreen: true,
    exitOnCtrlC: true,
    maxFps: 30,
    ...streams,
  });
}

/**
 * `shura solo <mode>`: a game in the terminal until Ctrl+C. Returns the exit code. Keys come from
 * the terminal, so it needs an interactive one.
 */
export async function runSolo(options: { mode: SoloMode; noColor: boolean }): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('shura solo needs an interactive terminal.');
    return 1;
  }
  const colors = detectColorMode(options.noColor, process.env);
  const app = startTerminalApp(<App mode={options.mode} clock={terminalClock()} colors={colors} />);
  await app.waitUntilExit();
  return 0;
}
