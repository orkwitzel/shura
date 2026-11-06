import { createEngine } from '@shura/engine';
import { matchLogEntrySchema, matchLogStartSchema } from '@shura/game/match-log';
import type { MatchLogRecord } from '@shura/valkey';

/**
 * Replays a match from its log (design §9.6): each player's engine from the seed and the mode
 * settings, fed their logged batches in `seq` order, as the server verified them. Returns each
 * player's final frame and hash.
 */
export function replayMatchLog(record: MatchLogRecord) {
  const start = matchLogStartSchema.parse(record.start);
  const batches = record.appends.flatMap(({ entry }) => matchLogEntrySchema.parse(entry).batches);
  return start.players.map(({ id, index }) => {
    const engine = createEngine(start.settings, start.seed, index);
    const own = batches.filter(({ playerId }) => playerId === id).sort((a, b) => a.seq - b.seq);
    for (const { frames } of own) {
      const last = frames.at(-1)?.frame;
      if (last !== undefined) {
        engine.step(
          last,
          frames.flatMap(({ actions }) => actions),
        );
      }
    }
    return { playerId: id, frame: engine.state.frame, hash: engine.hash() };
  });
}
