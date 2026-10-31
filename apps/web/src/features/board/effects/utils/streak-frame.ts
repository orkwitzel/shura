import type { Theme } from '@shura/client-core';
import type { EffectRect } from './effect-frame';
import type { StreakEffect } from './streaks-for-routings';

/** A point on the match's stage, in CSS pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A streak on its way: what it is, and when it starts, in ms on the painter's clock. */
export interface RunningStreak {
  readonly streak: StreakEffect;
  readonly start: number;
}

/** Where streaks fly on the match's stage, and how they look. */
export interface StreakView {
  /** Where a player's streaks leave from: the middle of their well. `null` if not shown. */
  readonly origin: (playerId: string) => Point | null;
  /** Where streaks to a player land: the top of their garbage meter. `null` if not shown. */
  readonly target: (playerId: string) => Point | null;
  /** Your board's cell size, which the squares are sized by. */
  readonly cellSize: number;
  readonly theme: Theme;
}

export interface StreakFrame {
  /** The squares to draw over every board, in order. */
  readonly shapes: readonly EffectRect[];
  /** The streaks still running after this frame. */
  readonly running: readonly RunningStreak[];
}

/** How long a streak lasts, in ms: its flight, then a burst on the target's meter. */
export const STREAK_MS = 700;
/** The share of a streak that is its flight. */
const FLIGHT = 0.75;
/** The squares in a streak's trail, and how far apart they are along the flight. */
const TRAIL = 10;
const TRAIL_STEP = 0.03;
/** How high the arc rises above the higher end, in cells. */
const ARC_CELLS = 4;
/** The burst's particles, and how far they fly, in cells. */
const BURST = 12;
const BURST_CELLS = 2;
/** A streak grows with its attack's lines, up to 4. */
const MAX_GROWTH = 4;

/**
 * What the running attack streaks draw at `now` (design §13.2, Match): each a trail of pixel
 * squares along an arc from the attacker's well to the target's meter, the accent colour behind a
 * cream head, each with a hard shadow, then a burst of squares on the meter. A streak whose attacker
 * or target isn't on the stage is dropped. Pure: the same streaks at the same time draw the same.
 */
export function streakFrame(
  running: readonly RunningStreak[],
  now: number,
  { origin, target, cellSize: c, theme }: StreakView,
): StreakFrame {
  const shadows: EffectRect[] = [];
  const squares: EffectRect[] = [];
  const still: RunningStreak[] = [];
  const accent = theme.chrome.accent.rgb;
  const head = theme.chrome.text.rgb;
  const square = (at: Point, size: number, color: EffectRect['color'], alpha: number) => {
    const side = Math.max(Math.round(size), 2);
    const x = Math.round(at.x - side / 2);
    const y = Math.round(at.y - side / 2);
    const drop = Math.max(Math.round(side / 4), 1);
    shadows.push({
      type: 'rect',
      x: x + drop,
      y: y + drop,
      width: side,
      height: side,
      color: theme.web.shadow,
      alpha: alpha * 0.5,
    });
    squares.push({ type: 'rect', x, y, width: side, height: side, color, alpha });
  };

  for (const entry of running) {
    const { streak, start } = entry;
    const from = origin(streak.from);
    const to = target(streak.to);
    const elapsed = now - start;
    if (!from || !to || elapsed > STREAK_MS) continue;
    still.push(entry);
    if (elapsed < 0) continue;
    const progress = elapsed / STREAK_MS;
    const grow = 1 + 0.15 * Math.min(streak.lines, MAX_GROWTH);
    if (progress < FLIGHT) {
      const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - ARC_CELLS * c };
      const along = (s: number): Point => ({
        x: (1 - s) ** 2 * from.x + 2 * (1 - s) * s * control.x + s ** 2 * to.x,
        y: (1 - s) ** 2 * from.y + 2 * (1 - s) * s * control.y + s ** 2 * to.y,
      });
      const flown = progress / FLIGHT;
      // The tail first, so the head is drawn on top.
      for (let behind = TRAIL - 1; behind >= 0; behind--) {
        const s = flown - behind * TRAIL_STEP;
        if (s < 0) continue;
        const size = c * (0.45 - behind * 0.03) * grow;
        square(along(s), size, behind < 2 ? head : accent, 1 - behind / (TRAIL + 1));
      }
    } else {
      const burst = (progress - FLIGHT) / (1 - FLIGHT);
      for (let at = 0; at < BURST; at++) {
        const angle = (at / BURST) * 2 * Math.PI;
        const distance = (0.3 + burst * BURST_CELLS) * c;
        const point = {
          x: to.x + Math.cos(angle) * distance,
          y: to.y + Math.sin(angle) * distance,
        };
        const color = at % 2 === 0 ? accent : theme.pieces.Z.rgb;
        square(point, c * 0.3 * grow * (1 - burst * 0.7), color, Math.max(1 - burst, 0.05));
      }
    }
  }
  return { shapes: [...shadows, ...squares], running: still };
}
