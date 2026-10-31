import { expect, test } from 'vitest';
import type { SessionRecord } from '../src/index';
import { describeStores, TEST_OPTIONS } from './support/backends';

const TTL = TEST_OPTIONS.sessionTtlMs;
const SESSION: SessionRecord = { sessionId: 'session-a', nickname: 'Noa' };

describeStores('SessionStore', (harness) => {
  test('a session reads back by its token from another gateway', async () => {
    const { stores, peer } = harness();
    await stores.sessions.create('token-a', SESSION);
    expect(await peer().sessions.get('token-a')).toEqual(SESSION);
  });

  test('an unknown token reads as undefined', async () => {
    expect(await harness().stores.sessions.get('nope')).toBeUndefined();
  });

  test('the nickname and room change, and the room can be cleared', async () => {
    const { sessions } = harness().stores;
    await sessions.create('token-a', SESSION);
    expect(await sessions.update('token-a', { nickname: 'נועה', roomCode: 'K7QX' })).toBe(true);
    expect(await sessions.get('token-a')).toEqual({
      ...SESSION,
      nickname: 'נועה',
      roomCode: 'K7QX',
    });
    await sessions.update('token-a', { roomCode: null });
    expect(await sessions.get('token-a')).toEqual({ ...SESSION, nickname: 'נועה' });
  });

  test('updating an unknown token does not create a session', async () => {
    const { sessions } = harness().stores;
    expect(await sessions.update('nope', { nickname: 'Noa' })).toBe(false);
    expect(await sessions.get('nope')).toBeUndefined();
  });

  test('a session left unused expires after its TTL', async () => {
    const { stores, advance } = harness();
    await stores.sessions.create('token-a', SESSION);
    await advance(TTL / 2);
    expect(await stores.sessions.get('token-a')).toEqual(SESSION);
    await advance(TTL * 1.5);
    expect(await stores.sessions.get('token-a')).toBeUndefined();
  });

  test('every use slides the TTL', async () => {
    const { stores, advance } = harness();
    await stores.sessions.create('token-a', SESSION);
    await advance(TTL * 0.6);
    expect(await stores.sessions.touch('token-a')).toBe(true);
    await advance(TTL * 0.6);
    await stores.sessions.get('token-a');
    await advance(TTL * 0.6);
    await stores.sessions.update('token-a', { nickname: 'Dana' });
    await advance(TTL * 0.6);
    expect(await stores.sessions.get('token-a')).toEqual({ ...SESSION, nickname: 'Dana' });
    expect(await stores.sessions.touch('nope')).toBe(false);
  });

  test('a deleted session is gone', async () => {
    const { sessions } = harness().stores;
    await sessions.create('token-a', SESSION);
    await sessions.delete('token-a');
    expect(await sessions.get('token-a')).toBeUndefined();
  });
});
