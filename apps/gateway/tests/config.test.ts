import { LIMIT_DEFAULTS } from '@shura/protocol';
import { expect, test, vi } from 'vitest';
import { loadConfig } from '../src/config';

test('every limit defaults to the design’s value (§11), with nothing exempt or trusted', () => {
  expect(loadConfig({}).limits).toEqual({ ...LIMIT_DEFAULTS, exemptIps: [], trustedProxies: [] });
});

test('each limit is read from its own variable', () => {
  const { limits } = loadConfig({
    MAX_PAYLOAD_BYTES: '1024',
    INVALID_MESSAGES_BEFORE_DISCONNECT: '5',
    MESSAGES_PER_SECOND: '10',
    MESSAGE_BURST: '20',
    CONNECTIONS_PER_IP: '2',
    NEW_CONNECTIONS_PER_IP_PER_MINUTE: '4',
    ROOMS_PER_IP_PER_MINUTE: '1',
    HOSTED_ROOMS_PER_SESSION: '0',
    FAILED_JOINS_PER_IP_PER_MINUTE: '6',
    MAX_SPECTATORS: '8',
    QUICK_MATCH_COOLDOWN_MS: '500',
  });
  expect(limits).toEqual({
    maxPayloadBytes: 1024,
    invalidMessagesBeforeDisconnect: 5,
    messagesPerSecond: 10,
    messageBurst: 20,
    connectionsPerIp: 2,
    newConnectionsPerIpPerMinute: 4,
    roomsPerIpPerMinute: 1,
    hostedRoomsPerSession: 0,
    failedJoinsPerIpPerMinute: 6,
    maxSpectators: 8,
    quickMatchCooldownMs: 500,
    exemptIps: [],
    trustedProxies: [],
  });
});

test('LIMITS_EXEMPT_IPS and TRUSTED_PROXIES are comma-separated addresses and CIDR ranges', () => {
  const { limits } = loadConfig({
    LIMITS_EXEMPT_IPS: '127.0.0.1, ::1',
    TRUSTED_PROXIES: '10.0.0.0/8,fd00::/8',
  });
  expect(limits.exemptIps).toEqual(['127.0.0.1', '::1']);
  expect(limits.trustedProxies).toEqual(['10.0.0.0/8', 'fd00::/8']);
});

test.each([
  ['MESSAGES_PER_SECOND', '0'],
  ['MESSAGE_BURST', 'lots'],
  ['CONNECTIONS_PER_IP', '-1'],
  ['LIMITS_EXEMPT_IPS', 'localhost'],
  ['TRUSTED_PROXIES', '10.0.0.0/99'],
])('an invalid %s stops the gateway at startup', (name, value) => {
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('exited');
  });
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => loadConfig({ [name]: value })).toThrow('exited');
  expect(error.mock.calls[0]?.[0]).toContain(name);
  exit.mockRestore();
  error.mockRestore();
});
