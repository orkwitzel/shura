import type { CanvasDrawing, Rgb, Skin, Theme } from '@shura/client-core';
import { type BoardCell, VISIBLE_ROWS } from '@shura/engine';
import { shade } from '@/utils/color';
import { type BoardLayout, type CellShape, HIDDEN_ROWS_SHOWN } from '../../utils/layout-board';
import type { Effect } from './effects-for-events';

/** An effect on its way: what it is, and when it starts, in ms on the painter's clock. */
export interface RunningEffect {
  readonly effect: Effect;
  readonly start: number;
}

/** What the effects are drawn over: the board as last laid out, and the look. */
export interface EffectView {
  readonly layout: BoardLayout;
  readonly cellSize: number;
  readonly theme: Theme;
  readonly skin: Skin;
}

/** A filled rectangle, in the layout's pixels, at an alpha. */
export interface EffectRect {
  readonly type: 'rect';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: Rgb;
  readonly alpha: number;
}

/** A cell drawn as pixel art (`lib/pixi/draw-cell`) in a skin's drawing, at an alpha. */
export interface EffectCellShape {
  readonly type: 'cell';
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: Rgb;
  readonly drawing: CanvasDrawing;
  readonly alpha: number;
}

export type EffectShape = EffectRect | EffectCellShape;

/** One frame of the running effects. */
export interface EffectFrame {
  /** What to draw over the board, in order. */
  readonly shapes: readonly EffectShape[];
  /** How far to move the whole board (a shake, a nudge), in whole CSS pixels. */
  readonly offset: { readonly x: number; readonly y: number };
  /** The effects still running after this frame: the ones that ended are dropped. */
  readonly running: readonly RunningEffect[];
  /**
   * Whether a later frame would draw differently over the same board: false once nothing runs but
   * a finished fade, so the painter can stop redrawing.
   */
  readonly changing: boolean;
}

/** How long each effect lasts, in ms. A top-out's fade stays until the next game. */
export const EFFECT_MS: Record<Effect['type'], number> = {
  flash: 150,
  burst: 750,
  shake: 360,
  trail: 240,
  nudge: 200,
  glow: 180,
  pulse: 600,
  fade: Number.POSITIVE_INFINITY,
};

/** How long a top-out takes to fade the stack from top to bottom, in ms. */
const FADE_MS = 700;

/** How far into a nudge the board is lowest. */
const NUDGE_PEAK = 0.35;

/** Particles' speeds and gravity, in cells per second (squared), at their smallest. */
const PARTICLE = { across: 4, up: 7, gravity: 22 } as const;

/** How many rows a trail streaks up at most: a short one, whatever the drop. */
const TRAIL_ROWS = 4;

/** The effects to run, each starting at `now` plus its delay. */
export function startEffects(effects: readonly Effect[], now: number): RunningEffect[] {
  return effects.map((effect) => ({ effect, start: now + effect.delay }));
}

/** A number in [0, 1) from two integers, the same each time, so particles fly the same each frame. */
function noise(a: number, b: number): number {
  let hash = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
  hash ^= hash >>> 13;
  return (hash >>> 0) / 2 ** 32;
}

/**
 * What the running effects draw at `now` (design §13.2, Effects): the shapes over the board, the
 * board's offset, and the effects still running. Pure: the same effects at the same time draw the
 * same, and the game is never touched.
 */
export function effectFrame(
  running: readonly RunningEffect[],
  now: number,
  { layout, cellSize: c, theme, skin }: EffectView,
): EffectFrame {
  const art = c / 8;
  const { well } = layout.regions;
  const shapes: EffectShape[] = [];
  const offset = { x: 0, y: 0 };
  const snap = (value: number) => Math.round(value / art) * art;
  /** A board cell's top-left corner, row 0 at the bottom. */
  const cellX = (col: number) => well.x + col * c;
  const cellY = (row: number) => well.y + (VISIBLE_ROWS - 1 - row) * c;
  const colorOf = (kind: Exclude<BoardCell, null>): Rgb =>
    kind === 'G' ? theme.garbage.rgb : theme.pieces[kind].rgb;
  const rect = (x: number, y: number, width: number, height: number, color: Rgb, alpha: number) =>
    shapes.push({ type: 'rect', x, y, width, height, color, alpha });

  const still: RunningEffect[] = [];
  let changing = false;
  for (const run of running) {
    const { effect } = run;
    const age = now - run.start;
    const length = EFFECT_MS[effect.type];
    if (age >= length) continue;
    still.push(run);
    if (effect.type !== 'fade' || age < FADE_MS) changing = true;
    if (age < 0) continue;
    const t = age / length;
    switch (effect.type) {
      case 'flash':
        for (const row of effect.rows) {
          rect(well.x, cellY(row), well.width, c, theme.chrome.text.rgb, 0.85 * (1 - t));
        }
        break;
      case 'burst': {
        const seconds = age / 1000;
        const speed = 1 + effect.particles / 24;
        const alpha = t < 0.6 ? 1 : (1 - t) / 0.4;
        effect.cells.forEach(({ col, row, kind }, cell) => {
          const color = colorOf(kind);
          for (let n = 0; n < effect.particles; n++) {
            const seed = cell * 64 + n;
            const vx = (noise(seed, 1) * 2 - 1) * PARTICLE.across * speed;
            const vy = -(0.3 + noise(seed, 2)) * PARTICLE.up * speed;
            const size = noise(seed, 3) < 0.5 ? art : 2 * art;
            const x = cellX(col) + noise(seed, 4) * c + vx * seconds * c;
            const y =
              cellY(row) +
              noise(seed, 5) * c +
              (vy * seconds + (PARTICLE.gravity * seconds ** 2) / 2) * c;
            if (y > well.y + well.height + c) continue;
            rect(snap(x), snap(y), size, size, color, alpha);
          }
        });
        break;
      }
      case 'shake': {
        const by = effect.strength * (1 - t);
        offset.x += Math.round(by * Math.sin(age * 0.09));
        offset.y += Math.round(by * 0.5 * Math.cos(age * 0.13));
        break;
      }
      case 'nudge':
        offset.y += Math.round(
          effect.distance * (t < NUDGE_PEAK ? t / NUDGE_PEAK : (1 - t) / (1 - NUDGE_PEAK)),
        );
        break;
      case 'trail': {
        const color = theme.pieces[effect.kind].rgb;
        const tops = new Map<number, number>();
        for (const { col, row } of effect.cells) {
          tops.set(col, Math.max(tops.get(col) ?? row, row));
        }
        const ceiling = well.y - HIDDEN_ROWS_SHOWN * c;
        for (const [col, row] of tops) {
          const bottom = cellY(row);
          const top = Math.max(ceiling, bottom - Math.min(effect.rows, TRAIL_ROWS) * c);
          for (let y = bottom - 2 * art; y >= top; y -= 2 * art) {
            const near = 1 - (bottom - y) / (bottom - top + art);
            rect(cellX(col) + art, y, c - 2 * art, art, color, 0.6 * near * (1 - t));
          }
        }
        break;
      }
      case 'glow': {
        const color = shade(theme.pieces[effect.kind].rgb, 0.6);
        for (const { col, row } of effect.cells) {
          shapes.push({
            type: 'cell',
            x: cellX(col),
            y: cellY(row),
            size: c,
            color,
            drawing: skin.canvas,
            alpha: 0.9 * (1 - t),
          });
        }
        break;
      }
      case 'pulse': {
        const ring = 2 * art;
        const alpha = Math.abs(Math.sin(2 * Math.PI * t)) * (1 - t / 2);
        const color = theme.chrome.accent.rgb;
        const { x, y, width, height } = well;
        rect(x - ring, y - ring, width + 2 * ring, ring, color, alpha);
        rect(x - ring, y + height, width + 2 * ring, ring, color, alpha);
        rect(x - ring, y, ring, height, color, alpha);
        rect(x + width, y, ring, height, color, alpha);
        break;
      }
      case 'fade': {
        const grey = shade(theme.web.muted, -0.55);
        const top = well.y - HIDDEN_ROWS_SHOWN * c;
        const reached = top + Math.min(age / FADE_MS, 1) * (well.y + well.height - top);
        for (const { x, y, size, drawing } of lockedCells(layout)) {
          if (y < reached)
            shapes.push({ type: 'cell', x, y, size, color: grey, drawing, alpha: 1 });
        }
        break;
      }
    }
  }
  return { shapes, offset, running: still, changing };
}

/** The layout's locked cells. */
function lockedCells(layout: BoardLayout): CellShape[] {
  return layout.shapes.filter(
    (shape): shape is CellShape => shape.type === 'cell' && shape.part === 'locked',
  );
}
