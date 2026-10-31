import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import type { CaptureEntry } from '../src/input/capture';
import { App } from '../src/ui/app';
import type { InputOptions } from '../src/ui/use-terminal-input';
import { fakeClock } from './support/fake-clock';
import { resize, settle, visibleRows } from './support/ink';
import { memoryStores } from './support/stores';

/** The countdown before Go: 1.5 s. */
const COUNTDOWN_MS = 1_500;

/** Legacy bytes, as a terminal without the Kitty protocol sends them. */
const RIGHT = '\x1b[C';
const DOWN = '\x1b[B';

/** The debug panel's rows below the adapter, trimmed: the panel starts where its title does. */
function debugRows(frame: string): string[] {
  const lines = frame.split('\n');
  const column = lines.find((line) => line.includes('DEBUG INPUT'))?.indexOf('DEBUG INPUT') ?? 0;
  const rows = lines.map((line) => line.slice(column).trim());
  return rows.slice(rows.indexOf('adapter: precise') + 1).filter(Boolean);
}

/** Seed 7's first piece, the O, at spawn (columns 4–5) and one column right. */
const O_AT_SPAWN = ' . . . .[][] . . . .';
const O_ONE_RIGHT = ' . . . . .[][] . . .';
const O_THREE_RIGHT = ' . . . . . . .[][] .';

let app: ReturnType<typeof render> | undefined;
afterEach(() => app?.unmount());

/**
 * `shura solo sprint` with seed 7 on a fake clock, at 100×24, past the countdown, with the
 * config.json given, if any.
 */
async function sprint(input?: InputOptions, config?: unknown) {
  const clock = fakeClock(1_000);
  app = render(
    <App
      mode="sprint"
      clock={clock}
      seed={7}
      colors="none"
      {...memoryStores(config === undefined ? {} : { config })}
      {...(input && { input })}
    />,
  );
  resize(app, 100, 24);
  await settle();
  const rendered = app;
  const game = {
    frame: () => rendered.lastFrame() ?? '',
    /** The piece's top row, wherever gravity has taken it. */
    top: () => visibleRows(rendered.lastFrame()).find((row) => row.includes('[]')),
    async type(bytes: string) {
      rendered.stdin.write(bytes);
      await settle();
    },
    async run(ms: number) {
      clock.run(ms);
      await settle();
    },
  };
  await game.run(COUNTDOWN_MS + 20);
  return game;
}

describe('input adapter choice (design §7.3)', () => {
  it('says input: auto until a key shows what the terminal speaks', async () => {
    const game = await sprint();
    expect(game.frame()).toContain('input: auto');
    await game.type('c'); // Hold, sent as plain text: a legacy terminal.
    expect(game.frame()).toContain('input: basic');
  });

  it('moves a legacy arrow tap once, and the piece doesn’t slide on', async () => {
    const game = await sprint();
    await game.type(RIGHT);
    await game.run(2_000);
    expect(game.top()).toBe(O_ONE_RIGHT);
    expect(game.frame()).toContain('input: basic');
  });

  it('moves once per OS key repeat while a legacy arrow is held, and stops with it', async () => {
    const game = await sprint();
    await game.type(RIGHT);
    await game.run(500);
    await game.type(RIGHT);
    await game.run(32);
    await game.type(RIGHT);
    await game.run(2_000);
    expect(game.top()).toBe(O_THREE_RIGHT);
  });

  it('uses the adapter --input fixes from the start', async () => {
    const game = await sprint({ choice: 'precise' });
    expect(game.frame()).toContain('input: precise');
    expect(game.top()).toBe(O_AT_SPAWN);
  });
});

describe('--debug-input', () => {
  it('shows each raw key, the adapter and the key events it made, and captures them', async () => {
    const captured: CaptureEntry[] = [];
    const game = await sprint({
      choice: 'auto',
      debug: true,
      capture: { path: '/tmp/capture.jsonl', write: (entry) => captured.push(entry) },
    });
    expect(game.frame()).toContain('/tmp/capture.jsonl');
    await game.type(RIGHT);
    expect(game.frame()).toContain('^[[C');
    expect(game.frame()).toContain('moveRight press');
    await game.run(1_100);
    expect(game.frame()).toContain('moveRight release');
    expect(game.frame()).toContain('adapter: basic');
    expect(captured).toMatchObject([
      { bytes: RIGHT, adapter: 'auto' },
      { frame: 2, actions: ['moveRight'] },
      { bytes: null, adapter: 'basic' },
    ]);
  });

  it('shows the actions the input engine made of each key, frame by frame: auto-shift too', async () => {
    const game = await sprint({ choice: 'precise', debug: true });
    await game.type(RIGHT);
    await game.run(300);
    // The press moves at once, then DAS (10 frames) and ARR (2) move on until the wall.
    expect(debugRows(game.frame())).toEqual([
      '+0 ^[[C moveRight press',
      'f2 moveRight',
      'f12 moveRight',
      'f14 moveRight',
      'f16 moveRight',
    ]);
  });

  it('shows a wall run at ARR 0 as one frame of moves, and soft drop rows as they fall', async () => {
    const game = await sprint(
      { choice: 'precise', debug: true },
      { version: 1, handling: { arr: 0 } },
    );
    await game.type(RIGHT);
    await game.run(300);
    expect(debugRows(game.frame()).slice(1)).toEqual(['f2 moveRight', 'f12 moveRight×3']);
    await game.type(DOWN);
    await game.run(100);
    const rows = debugRows(game.frame());
    expect(rows.at(-3)).toMatch(/^\+\d+ \^\[\[B softDrop press$/);
    // A row at once, then one every 3 frames: ×20 at 1 row/s.
    expect(rows.slice(-2)).toEqual(['f20 softDrop', 'f23 softDrop']);
  });
});
