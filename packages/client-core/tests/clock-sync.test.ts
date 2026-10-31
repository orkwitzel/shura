import { expect, test } from 'vitest';
import { ClockSync } from '../src/index';

test('before any sample there is no offset and no ping', () => {
  const sync = new ClockSync();
  expect(sync.offset).toBeNull();
  expect(sync.ping).toBeNull();
});

test("the offset is the server's time minus the middle of the round trip (design §8.4)", () => {
  const sync = new ClockSync();
  // Sent at 100, back at 140: the server answered at 120 on our clock, which was 5120 on its own.
  sync.add({ sentAt: 100, receivedAt: 140, serverTime: 5120 });
  expect(sync.offset).toBe(5000);
  expect(sync.ping).toBe(40);
});

test('the sample with the shortest round trip sets the offset, and the latest the ping', () => {
  const sync = new ClockSync();
  sync.add({ sentAt: 0, receivedAt: 10, serverTime: 1005 });
  sync.add({ sentAt: 100, receivedAt: 200, serverTime: 1190 });
  expect(sync.offset).toBe(1000);
  expect(sync.ping).toBe(100);
});

test('only the last 30 samples count', () => {
  const sync = new ClockSync();
  sync.add({ sentAt: 0, receivedAt: 2, serverTime: 1001 });
  for (let sample = 1; sample <= 30; sample++) {
    sync.add({
      sentAt: sample * 100,
      receivedAt: sample * 100 + 50,
      serverTime: sample * 100 + 2025,
    });
  }
  expect(sync.offset).toBe(2000);
});
