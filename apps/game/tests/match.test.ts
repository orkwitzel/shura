import { CLOCK_LEAD_TOLERANCE } from '@shura/protocol';
import { describe, expect, test } from 'vitest';
import { framesOf, type TestMatch, testMatch, timeOf } from './support/test-match';

/** A batch every 3 frames, as clients send them (design §8.1). */
const BATCH = 3;

interface Plays {
  /** The last frame the player sends: they stop after it. Every frame if left out. */
  readonly until?: number;
  /** Hard-drops at every frame that's a multiple of this, and never if left out. */
  readonly dropEvery?: number;
}

/**
 * Plays `game` on time from frame 1 to `to`, a batch every 3 frames sent the moment its last frame
 * is the expected one, the players in the order `plays` lists them.
 */
function playOnTime(game: TestMatch, plays: Record<string, Plays>, to: number, from = 1): void {
  for (let last = from + BATCH - 1; last <= to; last += BATCH) {
    game.clock.advanceTo(timeOf(last));
    for (const [id, { until, dropEvery }] of Object.entries(plays)) {
      if (until === undefined || last <= until) game.send(id, framesOf(last - 2, last, dropEvery));
    }
  }
}

describe('clock enforcement (design §8.4)', () => {
  test.each([5, CLOCK_LEAD_TOLERANCE])('a batch %i frames ahead is verified', (lead) => {
    const game = testMatch(['ada', 'bo']);
    playOnTime(game, { ada: {}, bo: {} }, 30);
    game.send('ada', framesOf(31, 30 + lead));
    expect(game.sent.at(-1)).toEqual({ to: 'ada', message: { type: 'batchAck', seq: 10 } });
    expect(game.outcomes()).toEqual([]);
  });

  test('a batch 7 frames ahead removes the player, out at the batch', () => {
    const game = testMatch(['ada', 'bo']);
    playOnTime(game, { ada: {}, bo: {} }, 30);
    game.send('ada', framesOf(31, 37));
    expect(game.outcomes()[0]).toEqual({
      type: 'playerOut',
      playerId: 'ada',
      reason: 'removed',
      frame: 31,
    });
    expect(game.sent).not.toContainEqual({ to: 'ada', message: { type: 'batchAck', seq: 10 } });
  });

  test('a batch during the countdown removes the player', () => {
    const game = testMatch(['ada', 'bo']);
    game.send('ada', framesOf(1, 3));
    expect(game.outcomes()[0]).toMatchObject({ playerId: 'ada', reason: 'removed', frame: 1 });
  });

  test('a player who stops sending is lagged out at 3 s, at their last verified frame', () => {
    const game = testMatch(['ada', 'bo']);
    playOnTime(game, { ada: { until: 30 }, bo: {} }, 30 + 180);
    expect(game.outcomes()).toEqual([]);
    // More than 3 s (180 frames) behind once the expected frame is 211.
    game.clock.advanceTo(timeOf(211) - 1);
    expect(game.outcomes()).toEqual([]);
    game.clock.advanceTo(timeOf(211));
    expect(game.outcomes()).toEqual([
      { type: 'playerOut', playerId: 'ada', reason: 'laggedOut', frame: 30 },
      {
        type: 'matchEnd',
        placements: [
          { playerId: 'bo', place: 1 },
          { playerId: 'ada', place: 2, reason: 'laggedOut', frame: 30 },
        ],
        stats: expect.any(Array),
      },
    ]);
  });

  test('a batch that comes more than 3 s behind lags the player out, even if the timer is late', () => {
    const game = testMatch(['ada', 'bo']);
    playOnTime(game, { ada: {}, bo: {} }, 30);
    game.clock.jumpTo(timeOf(212));
    game.send('ada', framesOf(31, 212));
    expect(game.outcomes()[0]).toEqual({
      type: 'playerOut',
      playerId: 'ada',
      reason: 'laggedOut',
      frame: 30,
    });
  });

  test('a player who never sends is lagged out 3 s after the start, at frame 0', () => {
    const game = testMatch(['ada', 'bo']);
    playOnTime(game, { bo: {} }, 180);
    game.clock.advanceTo(timeOf(181));
    expect(game.outcomes()[0]).toEqual({
      type: 'playerOut',
      playerId: 'ada',
      reason: 'laggedOut',
      frame: 0,
    });
  });

  test('a player running in slow motion is lagged out where they fell 3 s behind', () => {
    const game = testMatch(['ada', 'bo']);
    // Ada plays a batch of 3 frames every 6 frames of server time: half speed.
    let ada = 0;
    for (let last = 3; game.outcomes().length === 0 && last < 1000; last += BATCH) {
      game.clock.advanceTo(timeOf(last));
      if (game.outcomes().length > 0) break;
      game.send('bo', framesOf(last - 2, last));
      if (last % 6 === 0) {
        game.send('ada', framesOf(ada + 1, ada + 3));
        ada += 3;
      }
    }
    expect(game.outcomes()[0]).toEqual({
      type: 'playerOut',
      playerId: 'ada',
      reason: 'laggedOut',
      frame: ada,
    });
    // She fell more than 180 frames behind with the expected frame at 361 or so.
    expect(ada).toBeGreaterThanOrEqual(177);
    expect(ada).toBeLessThanOrEqual(183);
  });

  test('a batch on time after a stall keeps the player in', () => {
    const game = testMatch(['ada', 'bo']);
    playOnTime(game, { ada: { until: 30 }, bo: {} }, 30 + 150);
    // 2.5 s of frames, at once: behind, but not by 3 s.
    game.send('ada', framesOf(31, 180));
    playOnTime(game, { ada: {}, bo: {} }, 600, 181);
    expect(game.outcomes()).toEqual([]);
  });

  test('the lag-out timers stop with the match', () => {
    const game = testMatch(['ada', 'bo']);
    playOnTime(game, { ada: {}, bo: {} }, 30);
    game.match.stop();
    game.clock.advanceTo(timeOf(1000));
    expect(game.outcomes()).toEqual([]);
  });
});

describe('placements by frame (design §10.1)', () => {
  test("a later top-out verified first doesn't place first: the match end waits", () => {
    const game = testMatch(['ada', 'bo']);
    // Ada's 13th drop tops her out at frame 52, and Bo's at 39, but Bo's batches run late.
    playOnTime(game, { ada: { dropEvery: 4 }, bo: { dropEvery: 3, until: 30 } }, 54);
    expect(game.outcomes()).toEqual([
      { type: 'playerOut', playerId: 'ada', reason: 'toppedOut', frame: 52 },
    ]);
    game.send('bo', framesOf(31, 42, 3));
    expect(game.outcomes()).toEqual([
      { type: 'playerOut', playerId: 'ada', reason: 'toppedOut', frame: 52 },
      { type: 'playerOut', playerId: 'bo', reason: 'toppedOut', frame: 39 },
      {
        type: 'matchEnd',
        placements: [
          { playerId: 'ada', place: 1, reason: 'toppedOut', frame: 52 },
          { playerId: 'bo', place: 2, reason: 'toppedOut', frame: 39 },
        ],
        stats: expect.any(Array),
      },
    ]);
  });

  test('two top-outs at the same frame in a 3-player FFA share 2nd place', () => {
    const game = testMatch(['ada', 'bo', 'cy'], 'ffa');
    playOnTime(game, { ada: { dropEvery: 10 }, bo: { dropEvery: 4 }, cy: { dropEvery: 4 } }, 54);
    expect(game.outcomes()).toEqual([
      { type: 'playerOut', playerId: 'bo', reason: 'toppedOut', frame: 52 },
      { type: 'playerOut', playerId: 'cy', reason: 'toppedOut', frame: 52 },
      {
        type: 'matchEnd',
        placements: [
          { playerId: 'ada', place: 1 },
          { playerId: 'bo', place: 2, reason: 'toppedOut', frame: 52 },
          { playerId: 'cy', place: 2, reason: 'toppedOut', frame: 52 },
        ],
        stats: expect.any(Array),
      },
    ]);
  });

  test('the match waits for a player still in to be verified past the last out', () => {
    const game = testMatch(['ada', 'bo', 'cy'], 'ffa');
    playOnTime(game, { ada: { until: 45 }, bo: { dropEvery: 4 }, cy: { dropEvery: 4 } }, 54);
    expect(game.outcomes().map(({ type }) => type)).toEqual(['playerOut', 'playerOut']);
    game.send('ada', framesOf(46, 51));
    expect(game.outcomes()).toHaveLength(2);
    game.send('ada', framesOf(52, 54));
    expect(game.outcomes().at(-1)).toMatchObject({
      type: 'matchEnd',
      placements: [{ playerId: 'ada', place: 1 }, { place: 2 }, { place: 2 }],
    });
  });

  test('leaving is out at the last verified frame', () => {
    const game = testMatch(['ada', 'bo', 'cy'], 'ffa');
    playOnTime(game, { ada: {}, bo: {}, cy: {} }, 30);
    game.match.leave('bo');
    expect(game.outcomes()).toEqual([
      { type: 'playerOut', playerId: 'bo', reason: 'left', frame: 30 },
    ]);
    // Bo is out: the batches still on their way change nothing.
    game.send('bo', framesOf(31, 33));
    expect(game.outcomes()).toHaveLength(1);
  });
});
