import { describe, expect, it } from 'vitest';
import { actionsByKey, DEFAULT_BINDINGS } from '../../../src/platform/input/bindings';
import {
  createInputAdapter,
  type InputChoice,
  KITTY_PROOF_WAIT,
} from '../../../src/platform/input/input-adapter';
import { type Capture, loadCaptures } from '../../support/captures';
import { replay as replayChunks } from '../../support/replay';

/**
 * Every recorded capture in tests/support/captures, replayed through the adapters and checked
 * against its header: synthetic ones for now, real-terminal ones from #34 (design §7.3). A capture
 * holds one gesture with one key: `tap` (press and let go) or `hold` (held through OS key repeat).
 */
const captures = loadCaptures();

/** What `choice` makes of the capture, polled long after its last key. */
async function replay(capture: Capture, choice: InputChoice) {
  const adapter = createInputAdapter(choice, DEFAULT_BINDINGS);
  const last = capture.chunks.at(-1)?.time ?? 0;
  const signals = await replayChunks(adapter, capture.chunks, last + 2 * KITTY_PROOF_WAIT);
  const action = actionsByKey(DEFAULT_BINDINGS).get(capture.header.key);
  const events = signals.flatMap((signal) =>
    signal.kind === 'key' && signal.event.action === action ? [signal.event] : [],
  );
  return { adapter, events };
}

describe.each(captures.map((capture) => [capture.file, capture] as const))('%s', (_, capture) => {
  const { protocol, gesture } = capture.header;
  const kitty = protocol === 'kitty';
  const times = capture.chunks.map((chunk) => chunk.time);
  const first = times[0] ?? 0;
  const last = times.at(-1) ?? 0;

  it('is a fixture the tests understand', () => {
    expect(['kitty', 'legacy']).toContain(protocol);
    expect(['tap', 'hold']).toContain(gesture);
    expect(actionsByKey(DEFAULT_BINDINGS).has(capture.header.key)).toBe(true);
  });

  it(`auto-detection picks ${kitty ? 'precise' : 'basic'}`, async () => {
    const { adapter } = await replay(capture, 'auto');
    expect(adapter.name).toBe(kitty ? 'precise' : 'basic');
  });

  it.each<InputChoice>(['auto', kitty ? 'precise' : 'basic'])(
    `%s turns the ${gesture} into one press, its repeats and one release`,
    async (choice) => {
      const { events } = await replay(capture, choice);
      // A legacy terminal's bytes are all presses and repeats; a Kitty one ends with a release.
      const repeats = (kitty ? times.slice(1, -1) : times.slice(1)).map((time) => ({
        kind: 'repeat',
        time,
      }));
      expect(events.slice(0, -1).map(({ kind, time }) => ({ kind, time }))).toEqual([
        { kind: 'press', time: first },
        ...repeats,
      ]);
      const release = events.at(-1);
      expect(release?.kind).toBe('release');
      if (kitty) {
        expect(release?.time).toBe(last);
      } else {
        // Inferred: after the last byte, within the longest wait for one (design §7.3).
        expect(release?.time).toBeGreaterThan(last);
        expect(release?.time).toBeLessThanOrEqual(last + KITTY_PROOF_WAIT);
      }
    },
  );
});
