import { expect, test } from 'vitest';
import { limitsOf, validateEnv } from '../../src/config';

test('every limit defaults to its design §11 value, with no address exempt or trusted', () => {
  expect(limitsOf(validateEnv({}))).toEqual({
    maxPayloadBytes: 16 * 1024,
    invalidMessagesBeforeDisconnect: 3,
    messagesPerSecond: 60,
    messageBurst: 120,
    connectionsPerIp: 10,
    newConnectionsPerIpPerMinute: 30,
    roomsPerIpPerMinute: 3,
    sessionsPerIpPerMinute: 10,
    failedJoinsPerIpPerMinute: 10,
    maxSpectators: 16,
    quickMatchCooldownMs: 3000,
    exemptIps: [],
    trustedProxies: [],
  });
});

test.each([
  ['MAX_PAYLOAD_BYTES', 'maxPayloadBytes'],
  ['INVALID_MESSAGES_BEFORE_DISCONNECT', 'invalidMessagesBeforeDisconnect'],
  ['MESSAGES_PER_SECOND', 'messagesPerSecond'],
  ['MESSAGE_BURST', 'messageBurst'],
  ['CONNECTIONS_PER_IP', 'connectionsPerIp'],
  ['NEW_CONNECTIONS_PER_IP_PER_MINUTE', 'newConnectionsPerIpPerMinute'],
  ['ROOMS_PER_IP_PER_MINUTE', 'roomsPerIpPerMinute'],
  ['SESSIONS_PER_IP_PER_MINUTE', 'sessionsPerIpPerMinute'],
  ['FAILED_JOINS_PER_IP_PER_MINUTE', 'failedJoinsPerIpPerMinute'],
  ['MAX_SPECTATORS', 'maxSpectators'],
  ['QUICK_MATCH_COOLDOWN_MS', 'quickMatchCooldownMs'],
])('%s sets the limit %s', (variable, limit) => {
  expect(limitsOf(validateEnv({ [variable]: '7' }))).toMatchObject({ [limit]: 7 });
});

test('the exempt and trusted lists take addresses and CIDR ranges, comma-separated', () => {
  const limits = limitsOf(
    validateEnv({
      LIMITS_EXEMPT_IPS: '127.0.0.1, ::1',
      TRUSTED_PROXIES: '10.0.0.0/8,fd00::/8',
    }),
  );
  expect(limits.exemptIps).toEqual(['127.0.0.1', '::1']);
  expect(limits.trustedProxies).toEqual(['10.0.0.0/8', 'fd00::/8']);
});

test.each([
  ['MESSAGES_PER_SECOND', '0'],
  ['MESSAGE_BURST', 'lots'],
  ['MAX_PAYLOAD_BYTES', '1.5'],
  ['CONNECTIONS_PER_IP', '-1'],
  ['LIMITS_EXEMPT_IPS', 'localhost'],
  ['TRUSTED_PROXIES', '10.0.0.0/33'],
])('%s=%s stops startup', (variable, value) => {
  expect(() => validateEnv({ [variable]: value })).toThrow(variable);
});
