import { expect, test } from 'vitest';
import type { MatchedNotice, MatchQueue, QuickMatchResult } from '../src/index';
import { describeStores, TEST_OPTIONS } from './support/backends';

const COOLDOWN = TEST_OPTIONS.requeueCooldownMs;

describeStores('MatchQueue', (harness) => {
  test('the first player waits and the second is paired with them', async () => {
    const { stores, peer } = harness();
    expect(await stores.matchQueue.quickMatch('a')).toEqual({ status: 'queued' });
    expect(await stores.matchQueue.length()).toBe(1);
    expect(await peer().matchQueue.quickMatch('b')).toEqual({ status: 'matched', partnerId: 'a' });
    expect(await stores.matchQueue.length()).toBe(0);
  });

  test('a session has one queue entry', async () => {
    const queue = harness().stores.matchQueue;
    await queue.quickMatch('a');
    expect(await queue.quickMatch('a')).toEqual({ status: 'alreadyQueued' });
    expect(await queue.length()).toBe(1);
  });

  test('two concurrent requests never pop the same partner', async () => {
    const { stores, peer } = harness();
    await stores.matchQueue.quickMatch('a');
    const results = await Promise.all([
      stores.matchQueue.quickMatch('b'),
      peer().matchQueue.quickMatch('c'),
    ]);
    expect(results).toContainEqual({ status: 'matched', partnerId: 'a' });
    expect(results).toContainEqual({ status: 'queued' });
  });

  test('many concurrent requests from several gateways pair each player once', async () => {
    const { stores, peer } = harness();
    const gateways = [stores, peer(), peer()];
    const arriving = Array.from({ length: 21 }, (_, i) => `session-${i}`);
    const results: QuickMatchResult[] = await Promise.all(
      arriving.map((id, i) => (gateways[i % gateways.length] ?? stores).matchQueue.quickMatch(id)),
    );
    const pairs = arriving.flatMap((id, i) => {
      const result = results[i];
      return result?.status === 'matched' ? [[id, result.partnerId]] : [];
    });
    expect(pairs).toHaveLength(10);
    const paired = pairs.flat();
    expect(new Set(paired).size).toBe(20);
    expect(results.filter(({ status }) => status === 'queued')).toHaveLength(11);
    expect(await stores.matchQueue.length()).toBe(1);
    const [left] = arriving.filter((id) => !paired.includes(id));
    expect(await stores.matchQueue.cancel(left ?? '')).toBe(true);
  });

  test('a cancelled entry is no longer paired', async () => {
    const queue = harness().stores.matchQueue;
    await queue.quickMatch('a');
    expect(await queue.cancel('a')).toBe(true);
    expect(await queue.length()).toBe(0);
    expect(await queue.quickMatch('b')).toEqual({ status: 'queued' });
    expect(await queue.cancel('nobody')).toBe(false);
  });

  test('rejoining right after leaving waits out the cooldown', async () => {
    const { stores, advance } = harness();
    const queue = stores.matchQueue;
    await queue.quickMatch('a');
    await queue.cancel('a');
    const refused = await queue.quickMatch('a');
    expect(refused.status).toBe('coolingDown');
    if (refused.status !== 'coolingDown') return;
    expect(refused.retryAfterMs).toBeGreaterThan(0);
    expect(refused.retryAfterMs).toBeLessThanOrEqual(COOLDOWN);
    expect(await queue.length()).toBe(0);
    await advance(COOLDOWN * 1.2);
    expect(await queue.quickMatch('a')).toEqual({ status: 'queued' });
  });

  test("being paired starts no cooldown for the waiting player's next match", async () => {
    const queue = harness().stores.matchQueue;
    await queue.quickMatch('a');
    await queue.quickMatch('b');
    expect(await queue.quickMatch('a')).toEqual({ status: 'queued' });
  });

  test("the waiting player's gateway hears about the pair from the pairing gateway", async () => {
    const { stores, peer } = harness();
    const waitingGateway = stores.matchQueue;
    const pairingGateway = peer().matchQueue;
    const a = await listen(waitingGateway, 'a');
    const other = await listen(waitingGateway, 'someone-else');
    await waitingGateway.quickMatch('a');
    expect(await pairingGateway.quickMatch('b')).toEqual({ status: 'matched', partnerId: 'a' });
    await pairingGateway.notifyMatched({ sessionId: 'a', partnerId: 'b', roomCode: 'QM22' });
    expect(await a.next).toEqual({ sessionId: 'a', partnerId: 'b', roomCode: 'QM22' });
    expect(other.heard).toEqual([]);
    await a.stop();
    await other.stop();
  });

  test('an unsubscribed listener hears nothing more', async () => {
    const { stores, peer } = harness();
    const stopped = await listen(stores.matchQueue, 'a');
    await stopped.stop();
    const still = await listen(stores.matchQueue, 'a');
    await peer().matchQueue.notifyMatched({ sessionId: 'a', partnerId: 'b', roomCode: 'QM22' });
    await still.next;
    expect(stopped.heard).toEqual([]);
    await still.stop();
  });
});

/** Listens for `sessionId`'s notices: what it heard so far, and the next one to arrive. */
async function listen(queue: MatchQueue, sessionId: string) {
  const heard: MatchedNotice[] = [];
  let arrive: (notice: MatchedNotice) => void = () => {};
  const next = new Promise<MatchedNotice>((resolve) => {
    arrive = resolve;
  });
  const stop = await queue.onMatched(sessionId, (notice) => {
    heard.push(notice);
    arrive(notice);
  });
  return { heard, next, stop };
}
