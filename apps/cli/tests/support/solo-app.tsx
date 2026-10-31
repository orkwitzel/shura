import type { SoloMode } from '@shura/client-core';
import { render } from 'ink-testing-library';
import { App } from '../../src/ui/app';
import { fakeClock } from './fake-clock';
import { resize, settle } from './ink';
import { memoryStores } from './stores';

/** The countdown before Go: 1.5 s. */
export const COUNTDOWN_MS = 1_500;

/** Kitty-protocol key presses and releases (design §7.3). */
export const KEYS = {
  right: '\x1b[C',
  rightUp: '\x1b[1;1:3C',
  space: '\x1b[32u',
  escape: '\x1b[27u',
  enter: '\x1b[13u',
  /** A letter's press, as `reportAllKeysAsEscapeCodes` sends it: `CSI <codepoint> u`. */
  letter: (letter: string) => `\x1b[${letter.codePointAt(0)}u`,
};

/**
 * `shura solo <mode>` with seed 7 (O first, in columns 4–5) on a fake clock, at 80×24. Unmount it
 * at the end of the test.
 */
export async function soloGame(mode: SoloMode = 'sprint') {
  const clock = fakeClock(1_000);
  const app = render(<App mode={mode} clock={clock} seed={7} colors="none" {...memoryStores()} />);
  resize(app, 80, 24);
  await settle();
  return {
    clock,
    app,
    frame: () => app.lastFrame() ?? '',
    async type(bytes: string) {
      app.stdin.write(bytes);
      await settle();
    },
    async run(ms: number, every?: number) {
      clock.run(ms, every);
      await settle();
    },
    async resize(columns: number, rows: number) {
      resize(app, columns, rows);
      await settle();
    },
  };
}
