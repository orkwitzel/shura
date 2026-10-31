import { type Action, createEngine, type ModeSettings } from '@shura/engine';
import type { MatchLogRecord } from '@shura/valkey';

/** A batch as the game service logs it. */
interface LoggedBatch {
  playerId: string;
  seq: number;
  frames: { frame: number; actions: Action[] }[];
}

/**
 * Replays a match from its log (design §9.6): each player's engine from the seed and the mode
 * settings, fed their logged batches in `seq` order, as the server verified them. Returns each
 * player's final frame and hash.
 */
export function replayMatchLog({ start, entries }: MatchLogRecord) {
  const players = start.players as { id: string; index: number }[];
  const batches = entries.flatMap((entry) => entry.batches as LoggedBatch[]);
  return players.map(({ id, index }) => {
    const engine = createEngine(start.settings as ModeSettings, start.seed, index);
    const own = batches.filter(({ playerId }) => playerId === id).sort((a, b) => a.seq - b.seq);
    for (const { frames } of own) {
      const last = frames.at(-1)?.frame;
      if (last !== undefined)
        engine.step(
          last,
          frames.flatMap(({ actions }) => actions),
        );
    }
    return { playerId: id, frame: engine.state.frame, hash: engine.hash() };
  });
}
