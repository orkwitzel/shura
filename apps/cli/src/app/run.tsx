import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { type Instance, type KittyFlagName, type RenderOptions, render } from 'ink';
import type { ReactElement } from 'react';
import { terminalClock } from '../platform/clock';
import { fileStorage, storagePaths } from '../platform/file-storage';
import { captureHeader, createCaptureFile } from '../platform/input/capture';
import type { InputChoice } from '../platform/input/detect';
import { detectColorMode } from '../platform/terminal/color-mode';
import { App } from './app';
import type { PlayOptions } from './commands';
import { exitMessages, openStores } from './stores';

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
 * Ctrl+C quits at once from anywhere; unmounting gives all of it back. With `input: 'basic'` the
 * protocol stays off, so a Kitty terminal sends what a terminal without it would (design §7.3).
 */
export function startTerminalApp(
  app: ReactElement,
  streams: TerminalStreams = {},
  input: InputChoice = 'auto',
): Instance {
  // Ink asks whether the terminal speaks the Kitty protocol before its input hook turns on raw
  // mode, so the terminal's answer would be echoed onto the screen. Raw mode first stops that;
  // Ink turns it off again on the way out.
  const stdin = streams.stdin ?? process.stdin;
  if ('setRawMode' in stdin && stdin.isTTY) stdin.setRawMode(true);
  return render(app, {
    kittyKeyboard: { mode: input === 'basic' ? 'disabled' : 'auto', flags: KITTY_FLAGS },
    alternateScreen: true,
    exitOnCtrlC: true,
    maxFps: 30,
    ...streams,
  });
}

/** Where `--debug-input` writes its capture: a new file in the current directory. */
export function captureFileName(now: Date): string {
  return `shura-input-${now.toISOString().replace(/[:.]/g, '-')}.jsonl`;
}

/**
 * `shura` and `shura solo <mode>`: the app in the terminal, on the main menu or straight on a game,
 * with the saved settings and records (design §13.3), until Quit or Ctrl+C. Returns the exit code.
 * Keys come from the terminal, so it needs an interactive one. `--debug-input` adds the input panel
 * to every game and writes every key to a capture file (design §7.3), whose path it prints on the
 * way out.
 */
export async function runApp(options: PlayOptions): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('shura needs an interactive terminal (try shura --help).');
    return 1;
  }
  const colors = detectColorMode(options.noColor, process.env);
  const location = { env: process.env, platform: process.platform, home: homedir() };
  const stores = openStores(fileStorage(storagePaths(location)));
  const capture = options.debugInput
    ? createCaptureFile(
        resolve(captureFileName(new Date())),
        captureHeader(options.input, process.env),
      )
    : undefined;
  const input = { choice: options.input, ...(capture && { debug: { capture } }) };
  const app = startTerminalApp(
    <App
      {...(options.mode && { mode: options.mode })}
      clock={terminalClock()}
      colors={colors}
      input={input}
      {...stores}
    />,
    {},
    options.input,
  );
  await app.waitUntilExit();
  if (capture) console.log(`Input capture written to ${capture.path}`);
  // The game drew on the alternate screen, so the full messages go where they stay readable.
  for (const message of exitMessages(stores)) console.error(message);
  return 0;
}
