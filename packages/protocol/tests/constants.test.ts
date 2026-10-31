import { expect, test } from 'vitest';
import {
  BATCH_FRAMES,
  CLOCK_BEHIND_WINDOW,
  CLOCK_LEAD_TOLERANCE,
  COUNTDOWN_MS,
  EMPTY_ROOM_MS,
  GARBAGE_ACK_TIMEOUT,
  LAG_OUT_MS,
  LIMIT_DEFAULTS,
  MAX_SPECTATORS,
  PROTOCOL_VERSION,
  ROOM_TICK_MS,
  SEAT_HOLD_MS,
  SEATS,
} from '../src/index';

test('PROTOCOL_VERSION is still 1, since nothing has shipped', () => {
  expect(PROTOCOL_VERSION).toBe(1);
});

test('the clock constants are the design’s (§8.1, §8.4, §8.5)', () => {
  expect(CLOCK_LEAD_TOLERANCE).toBe(6); // frames: 100 ms
  expect(CLOCK_BEHIND_WINDOW).toBe(60); // frames: 1 s
  expect(LAG_OUT_MS).toBe(3000);
  expect(GARBAGE_ACK_TIMEOUT).toBe(600); // frames: 10 s of game time
  expect(ROOM_TICK_MS).toBe(50);
  expect(BATCH_FRAMES).toBe(3);
});

test('the room constants are the design’s (§10.1, §10.2)', () => {
  expect(SEATS).toEqual({ '1v1': 2, ffa: 8 });
  expect(MAX_SPECTATORS).toBe(16);
  expect(SEAT_HOLD_MS).toBe(30_000);
  expect(EMPTY_ROOM_MS).toBe(60_000);
  expect(COUNTDOWN_MS).toBe(3000);
});

test('the limit defaults are the design’s (§11)', () => {
  expect(LIMIT_DEFAULTS).toEqual({
    maxPayloadBytes: 16 * 1024,
    invalidMessagesBeforeDisconnect: 3,
    messagesPerSecond: 60,
    messageBurst: 120,
    connectionsPerIp: 10,
    newConnectionsPerIpPerMinute: 30,
    roomsPerIpPerMinute: 3,
    hostedRoomsPerSession: 1,
    failedJoinsPerIpPerMinute: 10,
    maxSpectators: 16,
  });
});
