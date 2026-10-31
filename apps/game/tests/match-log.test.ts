import { createMemoryStores, type MatchLog } from '@shura/valkey';
import { describe, expect, test } from 'vitest';
import { lockstepMatch, recordedPlayers, settle } from './support/lockstep';
import { RECORDED_LAST_FRAME } from './support/recorded-1v1';

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
    ...inner,
    append: (matchId, entry) =>
      new Promise((resolve, reject) => {
        gate.appends++;
        waiting.push({
          succeed: () => resolve(inner.append(matchId, entry)),
          fail: () => reject(new Error('Valkey is down')),
        });
      }),
  };
  return { log, gate, inner };
}

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
    const record = await inner.read('match-1');
    const seqs = record?.entries.flatMap(({ batches }) =>
      (batches as { playerId: string; seq: number }[])
        .filter(({ playerId }) => playerId === 'p0')
        .map(({ seq }) => seq),
    );
    expect(seqs?.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 60 }, (_, seq) => seq));
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

  test('holds the start, the verified batches and the routings, tagged with the epoch, and is deleted at match end', async () => {
    const stores = createMemoryStores();
    const reads: Awaited<ReturnType<MatchLog['read']>>[] = [];
    const log: MatchLog = {
      ...stores.matchLog,
      async delete(matchId) {
        reads.push(await stores.matchLog.read(matchId));
        await stores.matchLog.delete(matchId);
      },
    };
    const lockstep = lockstepMatch({ players: recordedPlayers(), log });
    await lockstep.play(RECORDED_LAST_FRAME);
    await settle();

    const record = reads[0];
    expect(record?.start).toMatchObject({
      seed: 9,
      players: [
        { id: 'p0', nickname: 'p0', index: 0 },
        { id: 'p1', nickname: 'p1', index: 1 },
      ],
    });
    expect(record?.entries.every(({ epoch }) => epoch === 1)).toBe(true);
    const routings = record?.entries.flatMap(({ routings }) => routings);
    expect(routings).toEqual(
      lockstep.routed.map(({ attack: { from, to, id, lines, holeSeed }, targetFrame }) => ({
        from,
        to,
        id,
        lines,
        holeSeed,
        frame: targetFrame,
      })),
    );
    expect(await stores.matchLog.read('match-1')).toBeUndefined();
  });
});
