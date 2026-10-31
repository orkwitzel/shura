import { expect, test } from 'vitest';
import type { RoomRecord } from '../src/index';
import { describeStores } from './support/backends';

const ROOM: RoomRecord = {
  podAddress: '10.0.0.7:8081',
  epoch: 1,
  mode: '1v1',
  phase: 'lobby',
  hostId: 'session-a',
};

describeStores('Registry', (harness) => {
  test('a created room reads back from another process', async () => {
    const { stores, peer } = harness();
    expect(await stores.registry.create('K7QX', ROOM)).toBe(true);
    expect(await peer().registry.get('K7QX')).toEqual(ROOM);
  });

  test('an unknown room reads as undefined', async () => {
    expect(await harness().stores.registry.get('ZZZZ')).toBeUndefined();
  });

  test('a code already in use is refused and keeps its room', async () => {
    const { registry } = harness().stores;
    await registry.create('K7QX', ROOM);
    expect(await registry.create('K7QX', { ...ROOM, podAddress: 'other:1', mode: 'ffa' })).toBe(
      false,
    );
    expect(await registry.get('K7QX')).toEqual(ROOM);
  });

  test('a quick-match room has no host', async () => {
    const { registry } = harness().stores;
    const { hostId: _, ...quickMatch } = ROOM;
    await registry.create('QM22', quickMatch);
    expect(await registry.get('QM22')).toEqual(quickMatch);
  });

  test('the phase and host change, and the host can be cleared', async () => {
    const { registry } = harness().stores;
    await registry.create('K7QX', ROOM);
    expect(await registry.update('K7QX', { phase: 'playing', hostId: 'session-b' })).toBe(true);
    expect(await registry.get('K7QX')).toEqual({ ...ROOM, phase: 'playing', hostId: 'session-b' });
    await registry.update('K7QX', { hostId: null });
    const { hostId: _, ...hostless } = ROOM;
    expect(await registry.get('K7QX')).toEqual({ ...hostless, phase: 'playing' });
  });

  test('updating a room that does not exist does not create it', async () => {
    const { registry } = harness().stores;
    expect(await registry.update('ZZZZ', { phase: 'playing' })).toBe(false);
    expect(await registry.get('ZZZZ')).toBeUndefined();
  });

  test('a new owner takes the room with the next epoch', async () => {
    const { registry } = harness().stores;
    await registry.create('K7QX', ROOM);
    expect(await registry.reassign('K7QX', '10.0.0.9:8081')).toEqual({
      ...ROOM,
      podAddress: '10.0.0.9:8081',
      epoch: 2,
    });
    expect(await registry.get('K7QX')).toMatchObject({ podAddress: '10.0.0.9:8081', epoch: 2 });
    expect(await registry.reassign('ZZZZ', '10.0.0.9:8081')).toBeUndefined();
  });

  test('a deleted room is gone and its code is free again', async () => {
    const { registry } = harness().stores;
    await registry.create('K7QX', ROOM);
    await registry.delete('K7QX');
    expect(await registry.get('K7QX')).toBeUndefined();
    expect(await registry.create('K7QX', ROOM)).toBe(true);
  });
});
