import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { startTerminalApp } from '../src/run';
import { App } from '../src/ui/app';
import { fakeClock } from './support/fake-clock';
import { settle } from './support/ink';

/** A terminal's stdout: a TTY 80×24 that records what's written to it. */
class TerminalOut extends EventEmitter {
  isTTY = true;
  columns = 80;
  rows = 24;
  written = '';
  write = (chunk: string, callback?: () => void) => {
    this.written += chunk;
    callback?.();
    return true;
  };
}

/** A terminal's stdin in raw mode, which tests type into. */
class TerminalIn extends EventEmitter {
  isTTY = true;
  rawMode = false;
  #data: string | null = null;
  setRawMode(on: boolean) {
    this.rawMode = on;
  }
  setEncoding() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
  read = () => {
    const data = this.#data;
    this.#data = null;
    return data;
  };
  type(data: string) {
    this.#data = data;
    this.emit('readable');
  }
}

const KITTY_QUERY = '\x1b[?u';
/** The terminal's answer to the query: it speaks the protocol, no flags set yet. */
const KITTY_REPLY = '\x1b[?0u';
const KITTY_POP = '\x1b[<u';
const ALT_SCREEN_ON = '\x1b[?1049h';
const ALT_SCREEN_OFF = '\x1b[?1049l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';

async function gameInTerminal() {
  const stdout = new TerminalOut();
  const stdin = new TerminalIn();
  const clock = fakeClock(1_000);
  const instance = startTerminalApp(<App mode="sprint" clock={clock} seed={7} colors="none" />, {
    // biome-ignore lint/suspicious/noExplicitAny: test doubles for the TTY streams
    stdout: stdout as any,
    // biome-ignore lint/suspicious/noExplicitAny: test doubles for the TTY streams
    stdin: stdin as any,
    // biome-ignore lint/suspicious/noExplicitAny: test doubles for the TTY streams
    stderr: new TerminalOut() as any,
    interactive: true,
    patchConsole: false,
  });
  await settle();
  expect(stdout.written).toContain(KITTY_QUERY);
  stdin.type(KITTY_REPLY);
  await settle();
  clock.run(2_000);
  await settle();
  return { stdout, stdin, clock, instance };
}

describe('Ctrl+C', () => {
  it.each([
    ['as the Kitty protocol reports it', '\x1b[99;5u'],
    ['as a legacy byte', '\x03'],
  ])('quits mid-game at once, %s, and leaves the terminal as it was', async (_, ctrlC) => {
    const { stdout, stdin, clock, instance } = await gameInTerminal();
    // The game took over the terminal: alternate screen, hidden cursor, keyboard protocol, raw mode.
    expect(stdout.written).toContain(ALT_SCREEN_ON);
    expect(stdout.written).toContain(CURSOR_HIDE);
    expect(stdout.written).toContain('\x1b[>'); // the keyboard protocol's flags pushed
    expect(stdin.rawMode).toBe(true);
    expect(stdout.written).toContain('NEXT');

    const before = stdout.written.length;
    stdin.type(ctrlC);
    await instance.waitUntilExit();

    const after = stdout.written.slice(before);
    expect(after).toContain(KITTY_POP);
    expect(after).toContain(ALT_SCREEN_OFF);
    expect(after.lastIndexOf(CURSOR_SHOW)).toBeGreaterThan(after.lastIndexOf(CURSOR_HIDE));
    expect(stdin.rawMode).toBe(false);
    // The game loop let go of the clock, so the process can exit.
    expect(clock.pending).toBe(0);
  });
});
