import { appendFileSync, writeFileSync } from 'node:fs';
import type { InputChoice } from './detect';
import type { AdapterName, InputSignal } from './terminal-input';

/**
 * The first line of a `--debug-input` capture (design §7.3). The CLI fills in the terminal and the
 * `--input` choice; whoever records it fills in the rest before committing it as a fixture.
 */
export interface CaptureHeader {
  readonly capture: 'shura-input';
  readonly version: 1;
  /** The terminal it was recorded in (`TERM_PROGRAM`, else `TERM`; add its version by hand). */
  readonly terminal: string;
  /** The keyboard encoding the terminal speaks: what auto-detection should pick. */
  readonly protocol: 'kitty' | 'legacy' | '';
  /** What was done, which the fixture tests check (`tap`, `hold`). */
  readonly gesture: string;
  /** The key it was done with, by its binding name (`left`, `x`, `space`). */
  readonly key: string;
  /** The adapter `--input` asked for. */
  readonly input: InputChoice;
}

/**
 * One line after the header, and one row of the debug panel: a raw key (its bytes) or an inferred
 * release (no bytes), the adapter after it, and the signals it made.
 */
export interface CaptureEntry {
  /** When it arrived, or fell due, on the session clock (ms). */
  readonly time: number;
  readonly bytes: string | null;
  readonly adapter: AdapterName;
  readonly signals: readonly InputSignal[];
}

/** The header for a capture made now. */
export function captureHeader(
  input: InputChoice,
  env: Readonly<Record<string, string | undefined>>,
): CaptureHeader {
  return {
    capture: 'shura-input',
    version: 1,
    terminal: env.TERM_PROGRAM || env.TERM || '',
    protocol: '',
    gesture: '',
    key: '',
    input,
  };
}

/** A capture being written. */
export interface CaptureFile {
  readonly path: string;
  write(entry: CaptureEntry): void;
}

/**
 * Starts a capture at `path` (overwriting it). Each entry is appended at once, so quitting with
 * Ctrl+C loses nothing.
 */
export function createCaptureFile(path: string, header: CaptureHeader): CaptureFile {
  writeFileSync(path, `${JSON.stringify(header)}\n`);
  return {
    path,
    write(entry) {
      const time = Math.round(entry.time * 10) / 10;
      appendFileSync(path, `${JSON.stringify({ ...entry, time })}\n`);
    },
  };
}

/** Terminal bytes as a person reads them: control bytes in caret notation, Space as `␣`. */
export function showBytes(bytes: string): string {
  return [...bytes]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code === 0x7f) return '^?';
      if (code < 0x20) return `^${String.fromCharCode(code + 0x40)}`;
      if (char === ' ') return '␣';
      return char;
    })
    .join('');
}
