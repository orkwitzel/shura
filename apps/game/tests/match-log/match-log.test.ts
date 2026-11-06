import { createMemoryStores, type MatchLog, type MatchLogRecord } from '@shura/valkey';
import { describe, expect, test } from 'vitest';
import { matchLogEntrySchema, matchLogStartSchema } from '../../src/match-log';
import { lockstepMatch, recordedPlayers } from '../support/lockstep';
import { RECORDED_LAST_FRAME, RECORDED_SEED } from '../support/recorded-1v1';
import { framesOf, settle, testMatch } from '../support/test-match';

/** A match log whose appends each wait to be let through or failed, oldest first. */
function gatedLog() {
  const inner = createMemoryStores().matchLog;
  const waiting: { succeed: () => void; fail: () => void }[] = [];
  const gate = {
    appends: 0,
    /** Lets the oldest waiting append through. */
    succeed: () => waiting.shift()?.succeed(),
    /** Fails the oldest waiting append, as a Valkey that's down would. */
    fail: () => waiting.shift()?.fail(),
    succeedAll: () => {
      while (waiting.length > 0) waiting.shift()?.succeed();
    },
    failAll: () => {
      while (waiting.length > 0) waiting.shift()?.fail();
    },
  };
  const log: MatchLog = {
    start: (matchId, start) => inner.start(matchId, start),
    read: (matchId) => inner.read(matchId),
    delete: (matchId) => inner.delete(matchId),
    append: (matchId, epoch, entry) =>
      new Promise((resolve, reject) => {
        gate.appends++;
        waiting.push({
          succeed: () => resolve(inner.append(matchId, epoch, entry)),
          fail: () => reject(new Error('Valkey is down')),
        });
      }),
  };
  return { log, gate, inner };
}

/** The appends of a log as read back, parsed. */
const entriesOf = (record: MatchLogRecord | undefined) =>
  (record?.appends ?? []).map(({ epoch, entry }) => ({
    epoch,
    ...matchLogEntrySchema.parse(entry),
  }));

describe('the match log', () => {
  test('a batch is acknowledged only once the append holding it has succeeded', async () => {
    const { log, gate } = gatedLog();
    const lockstep = lockstepMatch({ players: recordedPlayers(), log });
    await lockstep.play(60);
    expect(gate.appends).toBeGreaterThan(0);
    expect(lockstep.acks('p0')).toEqual([]);
    expect(lockstep.acks('p1')).toEqual([]);

    gate.succeedAll();
    await settle();
    // Every batch up to frame 60 is in the log now: one batch a frame, from seq 0.
    expect(lockstep.acks('p0').at(-1)).toBe(59);
    expect(lockstep.acks('p1').at(-1)).toBe(59);
  });

  test('while appends fail nothing is acknowledged, and once they succeed again everything is', async () => {
    const { log, gate, inner } = gatedLog();
    const lockstep = lockstepMatch({ players: recordedPlayers(), log });
    await lockstep.play(30);
    gate.failAll();
    await settle();
    expect(lockstep.acks('p0')).toEqual([]);

    await lockstep.play(60);
    gate.succeedAll();
    await settle();
    expect(lockstep.acks('p0').at(-1)).toBe(59);
    // The batches of the failed appends went again: the log holds every one.
    const seqs = entriesOf(await inner.read('match-1')).flatMap(({ batches }) =>
      batches.filter(({ playerId }) => playerId === 'p0').map(({ seq }) => seq),
    );
    expect(seqs.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 60 }, (_, seq) => seq));
  });

  test('a later batch logged before an earlier one waits for it to be acknowledged', async () => {
    const { log, gate } = gatedLog();
    const lockstep = lockstepMatch({ players: recordedPlayers(), log });
    await lockstep.play(12);
    // The append of frames 1 to 6 fails, after the one of frames 7 to 12 went out, which succeeds.
    gate.fail();
    await settle();
    gate.succeed();
    await settle();
    expect(lockstep.acks('p0')).toEqual([]);

    // Frames 1 to 6 go again with frame 13.
    await lockstep.play(13);
    gate.succeedAll();
    await settle();
    expect(lockstep.acks('p0').at(-1)).toBe(12);
  });

  test('a batch sent again is acknowledged again once it is in the log, and not before', async () => {
    const { log, gate } = gatedLog();
    const { match, send, resend, acks } = testMatch(['a', 'b'], { log });
    send('a', framesOf(1, 3));
    resend('a', 0, framesOf(1, 3));
    match.appendLog();
    await settle();
    expect(acks('a')).toEqual([]);

    gate.succeedAll();
    await settle();
    resend('a', 0, framesOf(1, 3));
    expect(acks('a')).toEqual([0, 0]);
  });

  test('holds the start, the verified batches and the routings, tagged with the epoch, and is deleted at match end', async () => {
    const stores = createMemoryStores();
    const reads: (MatchLogRecord | undefined)[] = [];
    const log: MatchLog = {
      start: (matchId, start) => stores.matchLog.start(matchId, start),
      append: (matchId, epoch, entry) => stores.matchLog.append(matchId, epoch, entry),
      read: (matchId) => stores.matchLog.read(matchId),
      async delete(matchId) {
        reads.push(await stores.matchLog.read(matchId));
        await stores.matchLog.delete(matchId);
      },
    };
    const lockstep = lockstepMatch({ players: recordedPlayers(), log });
    await lockstep.play(RECORDED_LAST_FRAME);
    await settle();

    expect(reads).toHaveLength(1);
    const record = reads[0];
    expect(matchLogStartSchema.parse(record?.start)).toMatchObject({
      seed: RECORDED_SEED,
      players: [
        { id: 'p0', index: 0 },
        { id: 'p1', index: 1 },
      ],
    });
    const entries = entriesOf(record);
    expect(entries.every(({ epoch }) => epoch === 1)).toBe(true);
    expect(entries.flatMap(({ routings }) => routings)).toEqual(
      lockstep.routed.map(({ attack: { from, to, id, lines, holeSeed }, targetFrame }) => ({
        from,
        to,
        id,
        lines,
        holeSeed,
        frame: targetFrame,
      })),
    );
    // Only the frames the server verified: p0's game ends at its top-out.
    const lastLogged = entries
      .flatMap(({ batches }) => batches)
      .filter(({ playerId }) => playerId === 'p0')
      .flatMap(({ frames }) => frames.map(({ frame }) => frame));
    expect(Math.max(...lastLogged)).toBe(RECORDED_LAST_FRAME);
    expect(await stores.matchLog.read('match-1')).toBeUndefined();
  });

  test('a match its room stops before the end deletes its log', async () => {
    const stores = createMemoryStores();
    const { match, send } = testMatch(['a', 'b'], { log: stores.matchLog });
    send('a', framesOf(1, 3));
    match.appendLog();
    await settle();
    expect(await stores.matchLog.read('match-1')).toBeDefined();

    match.stop();
    await settle();
    expect(await stores.matchLog.read('match-1')).toBeUndefined();
  });
});
