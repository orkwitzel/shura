import { expect, test } from 'vitest';
import { describeStores } from '../support/backends';

// The store keeps the entries as JSON, whatever their shape; these are shaped as the game service
// writes them (design §9.6).
const START = {
  seed: 3_141_592_653,
  settings: { mode: '1v1', garbageCap: 8 },
  players: [
    { id: 'session-a', nickname: 'Noa', index: 0 },
    { id: 'session-b', nickname: 'נועה', index: 1 },
  ],
};

function entry(frame: number) {
  return {
    batches: [
      {
        playerId: 'session-a',
        seq: frame,
        frames: [{ frame, actions: [{ frame, type: 'hardDrop' }] }],
      },
    ],
    routings: [{ id: frame, from: 'session-a', to: 'session-b', lines: 2, holeSeed: 7, frame }],
  };
}

describeStores('MatchLog', (harness) => {
  test('the start entry and every append read back in order, with their epochs', async () => {
    const { stores, peer } = harness();
    const log = stores.matchLog;
    expect(await log.start('match-1', START)).toBe(true);
    expect(await log.append('match-1', 1, entry(6))).toBe(true);
    expect(await log.append('match-1', 2, entry(12))).toBe(true);
    expect(await peer().matchLog.read('match-1')).toEqual({
      start: START,
      appends: [
        { epoch: 1, entry: entry(6) },
        { epoch: 2, entry: entry(12) },
      ],
    });
  });

  test('a match that was never started has no log, and appends to it fail', async () => {
    const log = harness().stores.matchLog;
    expect(await log.read('match-1')).toBeUndefined();
    expect(await log.append('match-1', 1, entry(6))).toBe(false);
    expect(await log.read('match-1')).toBeUndefined();
  });

  test('a match is started only once', async () => {
    const log = harness().stores.matchLog;
    await log.start('match-1', START);
    expect(await log.start('match-1', { ...START, seed: 1 })).toBe(false);
    expect(await log.read('match-1')).toEqual({ start: START, appends: [] });
  });

  test('pipelined appends keep the order they were made in', async () => {
    const log = harness().stores.matchLog;
    await log.start('match-1', START);
    const frames = Array.from({ length: 50 }, (_, i) => (i + 1) * 6);
    await Promise.all(frames.map((frame) => log.append('match-1', 1, entry(frame))));
    expect((await log.read('match-1'))?.appends).toEqual(
      frames.map((frame) => ({ epoch: 1, entry: entry(frame) })),
    );
  });

  test('the log keeps what was written, not later changes to it', async () => {
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
    await log.append('match-2', 1, entry(6));
    expect(await log.read('match-1')).toEqual({ start: START, appends: [] });
    expect((await log.read('match-2'))?.appends).toEqual([{ epoch: 1, entry: entry(6) }]);
  });

  test('a deleted log is gone, and late appends do not bring it back', async () => {
    const log = harness().stores.matchLog;
    await log.start('match-1', START);
    await log.append('match-1', 1, entry(6));
    await log.delete('match-1');
    expect(await log.read('match-1')).toBeUndefined();
    expect(await log.append('match-1', 1, entry(12))).toBe(false);
    expect(await log.read('match-1')).toBeUndefined();
  });
});
