import type { SoloSessionState } from '@shura/client-core';
import { createEngine, SPRINT } from '@shura/engine';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { ResultsScreen } from '../src/ui/results';

/** An ended Sprint, its engine state's numbers replaced by `engine`. */
function ended(engine: Partial<SoloSessionState['engine']>): SoloSessionState {
  return {
    mode: 'sprint',
    seed: 7,
    phase: 'ended',
    countdown: 0,
    engine: { ...createEngine(SPRINT, 7, 0).state, ...engine },
    actions: [],
  };
}

const KEYS = [
  { hint: 'R', label: 'Play again' },
  { hint: 'Enter, Esc', label: 'Back' },
];

/** The results screen's lines, without trailing spaces or the space between label and value. */
function screen(state: SoloSessionState, personalBest?: string): string[] {
  const app = render(
    <ResultsScreen
      state={state}
      keys={KEYS}
      {...(personalBest !== undefined && { personalBest })}
    />,
  );
  const frame = app.lastFrame() ?? '';
  app.unmount();
  return frame.split('\n').map((line) => line.trim().replace(/ {2,}/g, '  '));
}

const FINISHED = ended({
  finished: true,
  frame: 1_222,
  linesCleared: 40,
  piecesPlaced: 100,
  score: 12_345,
  level: 1,
});

const TOPPED_OUT = ended({
  toppedOut: true,
  frame: 300,
  linesCleared: 2,
  piecesPlaced: 12,
  score: 200,
  level: 1,
});

describe('the results screen', () => {
  it('shows a finished Sprint: its time as the headline, then each stat', () => {
    expect(screen(FINISHED)).toEqual(
      expect.arrayContaining([
        'SPRINT',
        'FINISHED',
        'TIME  0:20.367',
        'LINES  40',
        'PIECES  100',
        'PPS  4.91',
        'SCORE  12345',
        'LEVEL  1',
      ]),
    );
  });

  it('shows Game over and the same fields after a top-out', () => {
    const lines = screen(TOPPED_OUT);
    expect(lines).toEqual(
      expect.arrayContaining([
        'GAME OVER',
        'TIME  0:05.000',
        'LINES  2',
        'PIECES  12',
        'PPS  2.40',
        'SCORE  200',
        'LEVEL  1',
      ]),
    );
    expect(lines).not.toContain('FINISHED');
  });

  it('lists the keys it takes', () => {
    const lines = screen(FINISHED);
    expect(lines).toContain('R  Play again');
    expect(lines).toContain('Enter, Esc  Back');
  });

  it('shows the personal best line under the headline when there is one', () => {
    const lines = screen(FINISHED, 'New personal best!');
    expect(lines.indexOf('New personal best!')).toBe(lines.indexOf('TIME  0:20.367') + 1);
    expect(screen(FINISHED)).not.toContain('New personal best!');
  });
});
