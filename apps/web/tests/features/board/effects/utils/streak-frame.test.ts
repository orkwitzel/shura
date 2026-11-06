import { THEMES } from '@shura/client-core';
import { describe, expect, test } from 'vitest';
import { STREAK_MS, streakFrame } from '@/features/board/effects/utils/streak-frame';

const view = {
  // Where each player's streaks leave from (their well's middle) and land (their meter's top).
  origin: (id: string) => ({ me: { x: 100, y: 400 }, bo: { x: 900, y: 300 } })[id] ?? null,
  target: (id: string) => ({ me: { x: 40, y: 600 }, bo: { x: 820, y: 640 } })[id] ?? null,
  cellSize: 32,
  theme: THEMES.indigo,
};

const started = (from: string, to: string, start = 0) => [
  { streak: { type: 'streak' as const, from, to, lines: 2 }, start },
];

/** The middle of the last square drawn: the streak's head, drawn on top. */
function head(now: number, from = 'me', to = 'bo') {
  const shape = streakFrame(started(from, to), now, view).shapes.at(-1);
  if (!shape) throw new Error('nothing drawn');
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

describe('streakFrame (design §13.2, Match: the attack streak)', () => {
  test('leaves from the attacker’s well and flies to the target’s meter', () => {
    const first = head(0);
    expect(Math.hypot(first.x - 100, first.y - 400)).toBeLessThan(2);
    const late = head(STREAK_MS * 0.74);
    expect(Math.hypot(late.x - 820, late.y - 640)).toBeLessThan(16);
  });

  test('arcs over the boards on the way', () => {
    // Halfway, it is above both its ends: the attacker’s well at y 400, the meter at 640.
    expect(head(STREAK_MS * 0.375).y).toBeLessThan(400);
  });

  test('bursts on the target’s meter as it lands', () => {
    const { shapes } = streakFrame(started('me', 'bo'), STREAK_MS * 0.85, view);
    expect(shapes.length).toBeGreaterThan(0);
    for (const { x, y, width } of shapes) {
      expect(Math.hypot(x + width / 2 - 820, y + width / 2 - 640)).toBeLessThan(3 * 32);
    }
  });

  test('draws nothing before its start, and drops it once it has run its course', () => {
    const waiting = streakFrame(started('me', 'bo', 100), 50, view);
    expect(waiting.shapes).toEqual([]);
    expect(waiting.running).toHaveLength(1);
    const done = streakFrame(started('me', 'bo'), STREAK_MS + 1, view);
    expect(done.shapes).toEqual([]);
    expect(done.running).toEqual([]);
  });

  test('drops a streak to or from a board that isn’t shown', () => {
    const frame = streakFrame(started('me', 'gone'), 10, view);
    expect(frame.shapes).toEqual([]);
    expect(frame.running).toEqual([]);
  });

  test('draws every square on whole pixels, with an alpha in (0, 1]', () => {
    for (const now of [0, 100, 250, 400, 550, 650]) {
      for (const shape of streakFrame(started('bo', 'me'), now, view).shapes) {
        expect(Number.isInteger(shape.x)).toBe(true);
        expect(Number.isInteger(shape.y)).toBe(true);
        expect(shape.alpha).toBeGreaterThan(0);
        expect(shape.alpha).toBeLessThanOrEqual(1);
      }
    }
  });
});
