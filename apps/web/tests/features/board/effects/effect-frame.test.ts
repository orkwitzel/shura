import { SKINS, type Skin, THEMES } from '@shura/client-core';
import { createEngine, type EngineState, SPRINT } from '@shura/engine';
import { describe, expect, test } from 'vitest';
import {
  type EffectView,
  effectFrame,
  startEffects,
} from '@/features/board/effects/utils/effect-frame';
import type { Effect } from '@/features/board/effects/utils/effects-for-events';
import { layoutBoard } from '@/features/board/utils/layout-board';

const theme = THEMES.indigo;
const CELL = 32;

/** A board whose bottom `rows` rows are full of garbage but for column 0. */
function stacked(rows = 0): EngineState {
  const state = createEngine(SPRINT, 1, 0).serialize();
  for (let row = 0; row < rows; row++) {
    state.board[row] = ['G', ...Array(9).fill('G')].map((cell, col) => (col === 0 ? null : cell));
  }
  return state;
}

function view(state = stacked(), skin: Skin = SKINS.pixel): EffectView {
  return {
    layout: layoutBoard(state, theme, skin, CELL, { ghost: true }),
    cellSize: CELL,
    theme,
    skin,
  };
}

/** The effect's frame `after` ms after it started (at time 1000). */
const at = (effect: Effect, after: number, on = view()) =>
  effectFrame(startEffects([effect], 1_000), 1_000 + after, on);

describe('effectFrame', () => {
  test('an effect draws nothing before its delay, then runs until it ends and is dropped', () => {
    const flash: Effect = { type: 'flash', rows: [0], delay: 50 };
    expect(at(flash, 20).shapes).toEqual([]);
    expect(at(flash, 20).running).toHaveLength(1);
    expect(at(flash, 60).shapes.length).toBeGreaterThan(0);
    expect(at(flash, 5_000).shapes).toEqual([]);
    expect(at(flash, 5_000).running).toEqual([]);
  });

  test('a shake moves the board, then leaves it where it was', () => {
    const shake: Effect = { type: 'shake', strength: 6, delay: 0 };
    const moved = [30, 60, 90, 120].map((after) => at(shake, after).offset);
    expect(moved.some(({ x, y }) => x !== 0 || y !== 0)).toBe(true);
    for (const { x, y } of moved) {
      expect(Math.abs(x)).toBeLessThanOrEqual(6);
      expect(Math.abs(y)).toBeLessThanOrEqual(6);
    }
    expect(at(shake, 5_000).offset).toEqual({ x: 0, y: 0 });
  });

  test('a nudge moves the board down by up to its distance and back', () => {
    const nudge: Effect = { type: 'nudge', distance: 3, delay: 0 };
    const ys = [0, 40, 70, 120, 180].map((after) => at(nudge, after).offset.y);
    expect(Math.max(...ys)).toBe(3);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(at(nudge, 5_000).offset).toEqual({ x: 0, y: 0 });
  });

  test('a burst throws each cell’s particles in its colour, the garbage’s in the garbage colour', () => {
    const burst: Effect = {
      type: 'burst',
      cells: [
        { col: 0, row: 0, kind: 'T' },
        { col: 1, row: 0, kind: 'G' },
      ],
      particles: 3,
      delay: 0,
    };
    const { shapes } = at(burst, 16);
    expect(shapes).toHaveLength(6);
    const colors = shapes.map((shape) => shape.color);
    expect(colors.filter((color) => color === theme.pieces.T.rgb)).toHaveLength(3);
    expect(colors.filter((color) => color === theme.garbage.rgb)).toHaveLength(3);
    // Pixel particles: whole art pixels (a cell is 8), on the art-pixel grid.
    for (const shape of shapes) {
      expect(shape.x % (CELL / 8)).toBe(0);
      expect(shape.y % (CELL / 8)).toBe(0);
      expect(shape.type === 'rect' && shape.width % (CELL / 8)).toBe(0);
    }
  });

  test('a burst’s particles fly apart over time', () => {
    const burst: Effect = {
      type: 'burst',
      cells: [{ col: 4, row: 5, kind: 'I' }],
      particles: 8,
      delay: 0,
    };
    const spread = (after: number) => {
      const xs = at(burst, after).shapes.map((shape) => shape.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spread(300)).toBeGreaterThan(spread(16));
  });

  test('a glow draws the locked cells lighter, in the skin in use', () => {
    const glow: Effect = { type: 'glow', kind: 'L', cells: [{ col: 2, row: 0 }], delay: 0 };
    for (const skin of [SKINS.pixel, SKINS.flat, SKINS.outline]) {
      const on = view(stacked(), skin);
      const [cell, ...rest] = at(glow, 10, on).shapes;
      expect(rest).toEqual([]);
      const { well } = on.layout.regions;
      expect(cell).toMatchObject({
        type: 'cell',
        x: well.x + 2 * CELL,
        size: CELL,
        drawing: skin.canvas,
      });
      expect(cell?.color).not.toEqual(theme.pieces.L.rgb);
      // Board row 0 is the bottom of the well: 19 rows below its top, under the 2 hidden rows.
      expect(cell?.y).toBe(CELL * (2 + 19));
    }
  });

  test('a top-out fades the stack to grey from the top, and it stays grey', () => {
    const fade: Effect = { type: 'fade', delay: 0 };
    const on = view(stacked(10), SKINS.flat);
    const locked = on.layout.shapes.filter((shape) => shape.part === 'locked').length;
    const greyed = (after: number) => at(fade, after, on).shapes;
    // The stack's top is half way down: nothing's grey at first, part of it soon after, all of
    // it in the end, until the next game.
    expect(greyed(0)).toEqual([]);
    const part = greyed(500).length;
    expect(part).toBeGreaterThan(0);
    expect(part).toBeLessThan(locked);
    const all = greyed(60_000);
    expect(all).toHaveLength(locked);
    expect(all.every((shape) => shape.type === 'cell' && shape.drawing === SKINS.flat.canvas)).toBe(
      true,
    );
    // The top rows go first.
    const topY = Math.min(...greyed(500).map((shape) => shape.y));
    expect(greyed(500).every((shape) => shape.y <= topY + CELL * 9)).toBe(true);
    expect(at(fade, 60_000, on).running).toHaveLength(1);
  });

  test('a short trail streaks above the dropped piece, in its colour, and fades', () => {
    const trail: Effect = {
      type: 'trail',
      kind: 'I',
      cells: [3, 4, 5, 6].map((col) => ({ col, row: 0 })),
      rows: 10,
      delay: 0,
    };
    const { shapes } = at(trail, 10);
    expect(shapes.length).toBeGreaterThan(0);
    const bottom = CELL * (2 + 19);
    for (const shape of shapes) {
      expect(shape.color).toEqual(theme.pieces.I.rgb);
      expect(shape.y).toBeLessThan(bottom);
      // Short: at most 4 rows of the 10 it fell.
      expect(shape.y).toBeGreaterThanOrEqual(bottom - 4 * CELL);
    }
    const alpha = (after: number) =>
      Math.max(...at(trail, after).shapes.map((shape) => shape.alpha));
    expect(alpha(200)).toBeLessThan(alpha(10));
  });

  test('a level-up pulses the well’s border in the accent colour', () => {
    const { shapes } = at({ type: 'pulse', delay: 0 }, 150);
    expect(shapes).toHaveLength(4);
    for (const shape of shapes) expect(shape.color).toEqual(theme.chrome.accent.rgb);
    expect(shapes.every((shape) => shape.alpha > 0)).toBe(true);
  });

  test('says whether the frame changes with time: not once a fade is done and nothing else runs', () => {
    const fade = startEffects([{ type: 'fade', delay: 0 }], 1_000);
    expect(effectFrame(fade, 1_100, view(stacked(4))).changing).toBe(true);
    expect(effectFrame(fade, 60_000, view(stacked(4))).changing).toBe(false);
    const pulse = startEffects([{ type: 'pulse', delay: 0 }], 59_900);
    expect(effectFrame([...fade, ...pulse], 60_000, view(stacked(4))).changing).toBe(true);
    expect(effectFrame([], 60_000, view()).changing).toBe(false);
  });
});
