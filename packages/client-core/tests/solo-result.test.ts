import {
  ActionType,
  createEngine,
  type Engine,
  MARATHON,
  type ModeSettings,
  type PieceAction,
  SPRINT,
  ULTRA,
} from '@shura/engine';
import { describe, expect, it } from 'vitest';
import { type SoloMode, soloResult } from '../src/index';
import {
  MARATHON_ACTIONS,
  MARATHON_FINISH,
  MARATHON_SEED,
  SPRINT_ACTIONS,
  SPRINT_FINISH_FRAME,
  SPRINT_SEED,
  ULTRA_ACTIONS,
  ULTRA_SCORE,
  ULTRA_SEED,
} from './support/recorded-games';

const PRESETS: Record<SoloMode, ModeSettings> = {
  marathon: MARATHON,
  sprint: SPRINT,
  ultra: ULTRA,
};

/** A game of `mode` from `seed`, played with a recorded action log until it ends. */
function played(mode: SoloMode, seed: number, actions: readonly PieceAction[]) {
  const engine = createEngine(PRESETS[mode], seed, 0);
  const last = actions.at(-1)?.frame ?? 0;
  for (let frame = 1; frame <= last; frame++) {
    engine.step(
      frame,
      actions.filter((action) => action.frame === frame),
    );
  }
  return { mode, engine: engine.state };
}

/** A game of `mode` hard dropped one a frame until it tops out. */
function toppedOut(mode: SoloMode) {
  const engine: Engine = createEngine(PRESETS[mode], 7, 0);
  for (let frame = 1; !engine.state.toppedOut; frame++) {
    engine.step(frame, [{ frame, type: ActionType.HardDrop }]);
  }
  return { mode, engine: engine.state };
}

describe('a Marathon result', () => {
  it('is Finished at 150 lines, headed by the score, with the level', () => {
    const result = soloResult(played('marathon', MARATHON_SEED, MARATHON_ACTIONS));
    expect(result).toMatchObject({
      outcome: 'finished',
      headline: { kind: 'score', score: MARATHON_FINISH.score },
      score: MARATHON_FINISH.score,
      lines: 150,
      level: 15,
      frames: MARATHON_FINISH.frame,
      // 377 pieces, the recorded game's description says.
      pieces: 377,
    });
    expect(result.piecesPerSecond).toBeCloseTo((377 * 60) / 4_065, 10);
  });

  it('is Game over at a top-out, still headed by the score', () => {
    const game = toppedOut('marathon');
    expect(soloResult(game)).toMatchObject({
      outcome: 'gameOver',
      headline: { kind: 'score', score: game.engine.score },
      level: 1,
    });
  });
});

describe('an Ultra result', () => {
  it('is Finished at 2:00, headed by the score', () => {
    expect(soloResult(played('ultra', ULTRA_SEED, ULTRA_ACTIONS))).toMatchObject({
      outcome: 'finished',
      headline: { kind: 'score', score: ULTRA_SCORE },
      frames: 7_200,
      // 266 pieces and 83 clears, the recorded game's description says: 67 + 14 × 2 + 2 × 3 lines.
      pieces: 266,
      lines: 101,
      piecesPerSecond: 266 / 120,
    });
  });

  it('is Game over at a top-out before 2:00', () => {
    expect(soloResult(toppedOut('ultra')).outcome).toBe('gameOver');
  });
});

describe('a Sprint result', () => {
  it('is Finished at 40 lines, headed by the time in frames', () => {
    expect(soloResult(played('sprint', SPRINT_SEED, SPRINT_ACTIONS))).toMatchObject({
      outcome: 'finished',
      headline: { kind: 'time', frames: SPRINT_FINISH_FRAME },
      lines: 40,
      pieces: 109,
    });
  });

  it('is Game over at a top-out, headed by the time it lasted', () => {
    const game = toppedOut('sprint');
    expect(soloResult(game)).toMatchObject({
      outcome: 'gameOver',
      headline: { kind: 'time', frames: game.engine.frame },
    });
  });
});

it('counts no pieces per second before the first frame', () => {
  const engine = createEngine(MARATHON, 7, 0);
  expect(soloResult({ mode: 'marathon', engine: engine.state }).piecesPerSecond).toBe(0);
});
