import type { GameRun } from '@shura/client-core';
import { ActionType, createEngine, MARATHON, type PieceAction } from '@shura/engine';

/**
 * A Marathon game ended by topping out (hard drops, one a frame, until the stack reaches the top):
 * a game that has ended and counts for a personal best, without playing one.
 */
export function toppedOutMarathon(seed = 7): GameRun {
  const engine = createEngine(MARATHON, seed, 0);
  const actions: PieceAction[] = [];
  for (let frame = 1; !engine.state.toppedOut; frame++) {
    const action = { frame, type: ActionType.HardDrop } as const;
    actions.push(action);
    engine.step(frame, [action]);
  }
  return { mode: 'marathon', seed, actions, engine: engine.state };
}
