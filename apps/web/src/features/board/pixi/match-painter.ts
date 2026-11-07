import type { Application } from 'pixi.js';
import { addLayer, placeLayer } from '@/lib/pixi/pixi-app';
import { createEffectsPainter, type EffectsPainter } from '../effects/pixi/effects-painter';
import { createStreakPainter, type StreakPainter } from '../effects/pixi/streak-painter';
import type { BoardPaint, MatchBoard } from '../utils/match-frame';
import { type BoardPainter, createBoardPainter } from './board-painter';

/**
 * Paints a match's boards onto one Pixi stage, each on its own layer, with your game's effects
 * and the attack streaks over them. Thin and untested (design §13.2): what to paint comes from
 * `matchFrame`.
 */
export interface MatchPainter {
  /** Moves each board's layer to where `boards` lays it out on the stage. */
  arrange(boards: readonly MatchBoard[]): void;
  /** Paints the boards `paints` names again; every other board keeps what it has. */
  paint(paints: readonly BoardPaint[]): void;
  /** Your game's effects, which shake your board's layer. */
  readonly effects: EffectsPainter;
  readonly streaks: StreakPainter;
}

/** A painter for `boards` on `app`'s stage; `own` is your board's player id, `null` watching. */
export function createMatchPainter(
  app: Application,
  boards: readonly MatchBoard[],
  own: string | null,
): MatchPainter {
  // Each board on its own layer; yours has an inner one for the effects to shake.
  const layers = new Map(
    boards.map((board) => {
      const outer = addLayer(app);
      const inner = board.kind === 'own' ? addLayer(outer) : outer;
      return [board.playerId, { outer, inner, painter: createBoardPainter(inner) }] as const;
    }),
  );
  // Spectating, there's no game of your own: its effects layer stays empty.
  const ownLayer = (own !== null && layers.get(own)?.inner) || addLayer(app);
  const painters: ReadonlyMap<string, BoardPainter> = new Map(
    [...layers].map(([id, { painter }]) => [id, painter]),
  );
  return {
    arrange(boards) {
      for (const board of boards) {
        const layer = layers.get(board.playerId);
        if (layer) placeLayer(layer.outer, board.x, board.y);
      }
    },
    paint(paints) {
      for (const { playerId, layout } of paints) painters.get(playerId)?.paint(layout);
    },
    effects: createEffectsPainter(ownLayer),
    streaks: createStreakPainter(app),
  };
}
