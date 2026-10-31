import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { CaptureEntry, CaptureHeader } from '../../src/input/capture';
import type { TimedBytes } from './terminal-bytes';

/**
 * A recorded input fixture: a `--debug-input` capture file (design §7.3). The adapter tests replay
 * its bytes at their times and check what the adapters make of them against its header.
 */
export interface Capture {
  /** The file name, for test titles. */
  readonly file: string;
  readonly header: CaptureHeader;
  /** The bytes the terminal sent, one key each, timed from the first (ms). */
  readonly chunks: readonly TimedBytes[];
}

/** The fixtures folder: synthetic captures now, real-terminal ones from #34. */
export const CAPTURES_DIR = join(import.meta.dirname, 'captures');

/**
 * Reads a capture file: a JSON header line, then one JSON line per raw key or inferred release.
 * Inferred releases (no bytes) and what the adapter made of each key are left out: tests work them
 * out again.
 */
export function readCapture(path: string): Capture {
  const [first = '', ...rest] = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const header = JSON.parse(first) as CaptureHeader;
  if (header.capture !== 'shura-input' || header.version !== 1) {
    throw new Error(`${path} is not a version 1 shura input capture`);
  }
  const entries = rest.map((line) => JSON.parse(line) as CaptureEntry);
  const keys = entries.filter((entry) => entry.bytes !== null);
  const start = keys[0]?.time ?? 0;
  return {
    file: basename(path),
    header,
    chunks: keys.map(({ time, bytes }) => ({ time: time - start, bytes: bytes ?? '' })),
  };
}

/** Every capture in the fixtures folder. */
export function loadCaptures(): Capture[] {
  return readdirSync(CAPTURES_DIR)
    .filter((file) => file.endsWith('.jsonl'))
    .sort()
    .map((file) => readCapture(join(CAPTURES_DIR, file)));
}
