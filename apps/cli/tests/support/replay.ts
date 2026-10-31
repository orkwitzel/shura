import type { InputAdapter, InputSignal } from '../../src/platform/input/input-adapter';
import { parseTimedBytes, type TimedBytes } from './terminal-bytes';

/** Timed chunks written as `[time, bytes]` pairs. */
export function timed(chunks: readonly (readonly [number, string])[]): TimedBytes[] {
  return chunks.map(([time, bytes]) => ({ time, bytes }));
}

/**
 * The signals `adapter` makes of `chunks` (one terminal read each, parsed by Ink), then of polling
 * at `until`, if given.
 */
export async function replay(
  adapter: InputAdapter,
  chunks: readonly TimedBytes[],
  until?: number,
): Promise<InputSignal[]> {
  const signals: InputSignal[] = [];
  for (const raw of await parseTimedBytes(chunks)) signals.push(...adapter.feed(raw));
  if (until !== undefined) signals.push(...adapter.poll(until));
  return signals;
}
