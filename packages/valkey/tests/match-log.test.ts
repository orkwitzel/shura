import { expect, test } from 'vitest';
import type { MatchLogEntry, MatchLogStart } from '../src/index';
import { describeStores } from './support/backends';

const START: MatchLogStart = {
  seed: 3_141_592_653,
  settings: { mode: '1v1', garbageCap: 8 },
  players: [
    { id: 'session-a', nickname: 'Noa', index: 0 },
    { id: 'session-b', nickname: 'Dana', index: 1 },
  ],
};

function entry(frame: number, epoch = 1): MatchLogEntry {
  return {
    epoch,
    batches: [{ playerId: 'session-a', seq: frame, frames: [{ frame, actions: [{ type: 5 }] }] }],
    routings: [{ id: frame, from: 'session-a', to: 'session-b', lines: 2, holeSeed: 7, frame }],
  };
}

describeStores('MatchLog', (harness) => {
  test('the start entry and every append read back in order', async () => {
    const { stores, peer } = harness();
    const log = stores.matchLog;
    expect(await log.start('match-1', START)).toBe(true);
    expect(await log.append('match-1', entry(6))).toBe(true);
    expect(await log.append('match-1', entry(12))).toBe(true);
    expect(await peer().matchLog.read('match-1')).toEqual({
      start: START,
      entries: [entry(6), entry(12)],
    });
  });

  test('a match that was never started has no log, and appends to it fail', async () => {
    const log = harness().stores.matchLog;
    expect(await log.read('match-1')).toBeUndefined();
    expect(await log.append('match-1', entry(6))).toBe(false);
    expect(await log.read('match-1')).toBeUndefined();
  });

  test('a match is started only once', async () => {
    const log = harness().stores.matchLog;
    await log.start('match-1', START);
    expect(await log.start('match-1', { ...START, seed: 1 })).toBe(false);
    expect(await log.read('match-1')).toEqual({ start: START, entries: [] });
  });

  test('pipelined appends keep the order they were made in', async () => {
    const log = harness().stores.matchLog;
    await log.start('match-1', START);
    const frames = Array.from({ length: 50 }, (_, i) => i * 6);
    await Promise.all(frames.map((frame) => log.append('match-1', entry(frame))));
    expect((await log.read('match-1'))?.entries).toEqual(frames.map((frame) => entry(frame)));
  });

  test('each append keeps the epoch it was tagged with', async () => {
    const log = harness().stores.matchLog;
    await log.start('match-1', START);
    await log.append('match-1', entry(6, 1));
    await log.append('match-1', entry(12, 2));
    expect((await log.read('match-1'))?.entries.map(({ epoch }) => epoch)).toEqual([1, 2]);
  });

  test('the log keeps what was appended, not later changes to it', async () => {
    const log = harness().stores.matchLog;
    const start = structuredClone(START);
    await log.start('match-1', start);
    start.seed = 0;
    expect((await log.read('match-1'))?.start).toEqual(START);
  });

  test('matches have separate logs', async () => {
    const log = harness().stores.matchLog;
    await log.start('match-1', START);
    await log.start('match-2', { ...START, seed: 2 });
    await log.append('match-2', entry(6));
    expect(await log.read('match-1')).toEqual({ start: START, entries: [] });
    expect((await log.read('match-2'))?.entries).toEqual([entry(6)]);
  });

  test('a deleted log is gone, and late appends do not bring it back', async () => {
    const log = harness().stores.matchLog;
    await log.start('match-1', START);
    await log.append('match-1', entry(6));
    await log.delete('match-1');
    expect(await log.read('match-1')).toBeUndefined();
    expect(await log.append('match-1', entry(12))).toBe(false);
    expect(await log.read('match-1')).toBeUndefined();
  });
});
