import { ActionType, type PieceAction, type PieceActionType } from '@shura/engine';
// The engine's recorded single-player games (design §5.3): each a full game whose action log plays
// it to its end. Read from the engine package so they stay in step when the engine re-records them.
import marathon from '../../../engine/recorded-matches/marathon.json';
import sprint from '../../../engine/recorded-matches/sprint.json';
import ultra from '../../../engine/recorded-matches/ultra.json';
import { createSoloSession, type SoloMode, type SoloSession } from '../../src/index';
import { type FakeClock, fakeClock } from './fake-clock';

const PIECE_ACTION_TYPES = new Set<string>(
  Object.values(ActionType).filter((type) => type !== ActionType.GarbageAccepted),
);

function isPieceActionType(type: string): type is PieceActionType {
  return PIECE_ACTION_TYPES.has(type);
}

interface RecordedGame {
  seed: number;
  players: { actions: { frame: number; type: string }[] }[];
}

function actionsOf(recorded: RecordedGame): readonly PieceAction[] {
  return (recorded.players[0]?.actions ?? []).map(({ frame, type }) => {
    if (!isPieceActionType(type)) throw new Error(`not a piece action: ${type}`);
    return { frame, type };
  });
}

/** The recorded Sprint's seed. */
export const SPRINT_SEED: number = sprint.seed;

/** The recorded Sprint's action log, which finishes the game. */
export const SPRINT_ACTIONS: readonly PieceAction[] = actionsOf(sprint);

/** The frame the recorded Sprint finishes on (its description says so). */
export const SPRINT_FINISH_FRAME = 1_222;

/** The recorded Marathon's seed. */
export const MARATHON_SEED: number = marathon.seed;

/** The recorded Marathon's action log, which clears 150 lines and finishes the game. */
export const MARATHON_ACTIONS: readonly PieceAction[] = actionsOf(marathon);

/** The frame and score the recorded Marathon finishes on (its description says so). */
export const MARATHON_FINISH = { frame: 4_065, score: 171_349 } as const;

/** The recorded Ultra's seed. */
export const ULTRA_SEED: number = ultra.seed;

/** The recorded Ultra's action log, which plays the full 2 minutes. */
export const ULTRA_ACTIONS: readonly PieceAction[] = actionsOf(ultra);

/** The score the recorded Ultra finishes on, at the end of frame 7,200 (its description says so). */
export const ULTRA_SCORE = 21_449;

/**
 * A session of `mode` from `seed` on a fake clock, played through the countdown (1.5 s) with
 * `actions`, a recorded action log, and then for a second more. `before` sees the session first,
 * to listen to it.
 */
export function playRecorded(
  mode: SoloMode,
  seed: number,
  actions: readonly PieceAction[],
  before?: (session: SoloSession) => void,
) {
  const clock: FakeClock = fakeClock(1_000);
  const session: SoloSession = createSoloSession({ mode, clock, seed });
  before?.(session);
  const go = clock.now() + 1_500;
  // Each action arrives 1 ms into the frame before its own, after the wake that stepped it.
  for (const { frame, type } of actions) {
    clock.run(go + ((frame - 1) * 1000) / 60 + 1 - clock.now());
    session.act(type, clock.now());
  }
  clock.run(1_000);
  return { clock, session };
}
