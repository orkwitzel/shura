import { expect, test } from 'vitest';
import type { z } from 'zod';

/** A message's valid `data` examples and malformed ones, for `roundTrip`. */
export interface Examples {
  readonly valid: readonly object[];
  readonly invalid: readonly unknown[];
}

/**
 * Checks a union of `{ event, data }` messages, and the record of `data` schemas it's built from,
 * against `examples`, by event: they have exactly the events listed; each parses its valid
 * examples as they are, with an unknown field passed through on `data` and on the envelope; and
 * it refuses each malformed `data`, and a missing one.
 */
export function roundTrip(
  schema: z.ZodType,
  messages: Record<string, z.ZodType>,
  examples: Record<string, Examples>,
): void {
  test('has exactly the listed messages', () => {
    const events = Object.keys(examples).sort();
    expect(Object.keys(messages).sort()).toEqual(events);
    const accepted = events.filter(
      (event) => schema.safeParse({ event, data: examples[event]?.valid[0] }).success,
    );
    expect(accepted).toEqual(events);
    expect(schema.safeParse({ event: 'noSuchMessage', data: {} }).success).toBe(false);
  });

  for (const [event, { valid, invalid }] of Object.entries(examples)) {
    test(`${event} parses its valid examples`, () => {
      for (const data of valid) {
        expect(schema.parse({ event, data })).toEqual({ event, data });
      }
    });

    test(`${event} lets unknown fields through`, () => {
      for (const data of valid) {
        const message = { event, data: { ...data, addedLater: 1 }, id: 'x' };
        expect(schema.parse(message)).toEqual(message);
      }
    });

    test(`${event} refuses malformed data`, () => {
      expect(schema.safeParse({ event }).success).toBe(false);
      for (const data of invalid) {
        expect(schema.safeParse({ event, data }).success, JSON.stringify(data)).toBe(false);
      }
    });
  }
}
