import type { SoloSessionState } from '@shura/client-core';
import {
  ActionType,
  createEngine,
  type Engine,
  MARATHON,
  type PieceAction,
  SPRINT,
  ULTRA,
} from '@shura/engine';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { boardRows } from '../src/render/board';
import { RGB } from '../src/render/palette';
import { GameView, type GameViewProps } from '../src/ui/game-view';
import { visibleRows, wallRows } from './support/ink';

/**
 * Seed 7 deals O first (columns 4–5, rows 19–20 after its spawn drop: row 20 is above the visible
 * 20), then L, I, J, Z, T, S.
 */
function sprint(actions: PieceAction['type'][] = []): Engine {
  const engine = createEngine(SPRINT, 7, 0);
  for (const [index, type] of actions.entries()) {
    engine.step(index + 1, [{ frame: index + 1, type }]);
  }
  return engine;
}

function stateOf(engine: Engine, fields: Partial<SoloSessionState> = {}): SoloSessionState {
  return {
    mode: 'sprint',
    seed: 7,
    phase: 'playing',
    countdown: 0,
    engine: engine.state,
    actions: [],
    ...fields,
  };
}

/** The game view's frame, without colour unless asked. */
function view(engine: Engine, props: Partial<GameViewProps> = {}): string {
  const app = render(
    <GameView state={stateOf(engine)} colors="none" ghost input="precise" {...props} />,
  );
  const frame = app.lastFrame() ?? '';
  app.unmount();
  return frame;
}

function beside(frame: string, side: 'left' | 'right'): string[] {
  return wallRows(frame).map((row) => row[side]);
}

const EMPTY = ' . . . . . . . . . .';

describe('game view, without colour (glyphs)', () => {
  it('draws 20 visible rows, cells 2 characters wide, with the active piece', () => {
    const rows = visibleRows(view(sprint()));
    expect(rows).toHaveLength(20);
    expect(rows[0]).toBe(' . . . .[][] . . . .');
    expect(rows[1]).toBe(EMPTY);
  });

  it('draws the part of the piece above the visible rows, without walls', () => {
    const lines = view(sprint()).split('\n');
    const top = lines.findIndex((line) => line.includes('│'));
    expect(lines[top - 1]).toContain('[][]');
    expect(lines[top - 1]).not.toContain('│');
  });

  it('draws the ghost where a hard drop would land', () => {
    const rows = visibleRows(view(sprint()));
    expect(rows[18]).toBe(' . . . .:::: . . . .');
    expect(rows[19]).toBe(' . . . .:::: . . . .');
  });

  it('leaves the ghost out when it is off', () => {
    const rows = visibleRows(view(sprint(), { ghost: false }));
    expect(rows[19]).toBe(EMPTY);
  });

  it('draws locked cells', () => {
    const rows = visibleRows(view(sprint([ActionType.HardDrop])));
    expect(rows[18]).toBe(' . . . .[][] . . . .');
    expect(rows[19]).toBe(' . . . .[][] . . . .');
  });

  it('shows the 5-piece preview on the right: L, I, J, Z, T', () => {
    // Each piece flat, centred in 8 columns, with a blank line between pieces.
    expect(beside(view(sprint()), 'right').slice(0, 15)).toEqual([
      '  NEXT',
      '       []', // L
      '   [][][]',
      '',
      '  [][][][]', // I
      '',
      '',
      '   []', // J
      '   [][][]',
      '',
      '   [][]', // Z
      '     [][]',
      '',
      '     []', // T
      '   [][][]',
    ]);
  });

  it('shows the held piece on the left', () => {
    expect(beside(view(sprint()), 'left').slice(0, 3)).toEqual(['HOLD', '', '']);
    expect(beside(view(sprint([ActionType.Hold])), 'left').slice(0, 3)).toEqual([
      'HOLD',
      '  [][]',
      '  [][]',
    ]);
  });

  it("shows Sprint's time and lines, and the input status line", () => {
    const engine = sprint();
    for (let frame = 1; frame <= 600; frame++) engine.step(frame, []);
    const text = view(engine);
    expect(text).toContain('0:10.000');
    expect(text).toContain('0/40');
    expect(text).toContain('input: precise');
  });
});

/** The HUD's lines under hold (the left column below HOLD and its two piece rows), blanks kept. */
function hudLines(frame: string): string[] {
  return beside(frame, 'left').slice(4);
}

/** A game of the preset, played `frames` frames with no actions. */
function playedFor(preset: typeof MARATHON, frames: number): Engine {
  const engine = createEngine(preset, 7, 0);
  for (let frame = 1; frame <= frames; frame++) engine.step(frame, []);
  return engine;
}

describe("Marathon's HUD", () => {
  it('shows the level, the lines towards 150 and the score, from the start', () => {
    const engine = createEngine(MARATHON, 7, 0);
    const text = view(engine, { state: stateOf(engine, { mode: 'marathon' }) });
    expect(hudLines(text).slice(0, 8)).toEqual([
      'LEVEL',
      '1',
      '',
      'LINES',
      '0/150',
      '',
      'SCORE',
      '0',
    ]);
  });

  it("follows the engine's level, lines and score, the score in thousands", () => {
    const engine = createEngine(MARATHON, 7, 0);
    const later = { ...engine.state, level: 15, linesCleared: 147, score: 171_349 };
    const text = view(engine, { state: stateOf(engine, { mode: 'marathon', engine: later }) });
    expect(hudLines(text).slice(0, 8)).toEqual([
      'LEVEL',
      '15',
      '',
      'LINES',
      '147/150',
      '',
      'SCORE',
      '171,349',
    ]);
  });

  it("scores a hard drop's rows as the engine does", () => {
    const engine = createEngine(MARATHON, 7, 0);
    engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]);
    // The O falls from rows 19–20 to the floor, 19 rows, 2 points each (design §3).
    expect(engine.state.score).toBe(38);
    const text = view(engine, { state: stateOf(engine, { mode: 'marathon' }) });
    expect(hudLines(text).slice(6, 8)).toEqual(['SCORE', '38']);
  });
});

describe("Ultra's HUD", () => {
  it('shows the 2 minutes left and the score at Go', () => {
    const engine = createEngine(ULTRA, 7, 0);
    const text = view(engine, { state: stateOf(engine, { mode: 'ultra' }) });
    expect(hudLines(text).slice(0, 5)).toEqual(['TIME LEFT', '2:00.000', '', 'SCORE', '0']);
  });

  it('counts the time left down with the frame', () => {
    const engine = playedFor(ULTRA, 630);
    const text = view(engine, { state: stateOf(engine, { mode: 'ultra' }) });
    expect(hudLines(text).slice(0, 2)).toEqual(['TIME LEFT', '1:49.500']);
  });

  it('shows no time left and the score at 2:00', () => {
    const engine = createEngine(ULTRA, 7, 0);
    const done = { ...engine.state, finished: true, frame: 7_200, score: 21_449 };
    const text = view(engine, {
      state: stateOf(engine, { mode: 'ultra', phase: 'ended', engine: done }),
    });
    expect(hudLines(text).slice(0, 5)).toEqual(['TIME LEFT', '0:00.000', '', 'SCORE', '21,449']);
  });
});

describe('board colours', () => {
  it('draws cells as 24-bit colour blocks', () => {
    const [, top] = boardRows(sprint().state, { colors: 'truecolor', ghost: true });
    expect(top).toContain(`\x1b[38;2;${RGB.O.join(';')}m████`);
    expect(top).not.toContain('[]');
  });

  it('falls back to the 16 ANSI colours', () => {
    const [, top] = boardRows(sprint().state, { colors: 'ansi16', ghost: true });
    expect(top).toContain('\x1b[93m██'); // O is bright yellow
    expect(top).not.toContain('38;2;');
  });

  it('draws the ghost in the piece colour, lighter than a solid cell', () => {
    const rows = boardRows(sprint().state, { colors: 'ansi16', ghost: true });
    expect(rows.at(-2)).toContain('\x1b[93m░░');
  });

  it('makes one pre-coloured string per row: 2 hidden rows, 20 visible, and the floor', () => {
    expect(boardRows(sprint().state, { colors: 'truecolor', ghost: true })).toHaveLength(23);
  });
});
