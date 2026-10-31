import { expect, test } from 'vitest';
import { addressList, clientIp } from '../src/client-ip';

const NO_PROXIES = addressList([]);
const PROXY = addressList(['10.0.0.5']);

test('with no trusted proxies, the socket address is used and X-Forwarded-For is ignored', () => {
  expect(clientIp('203.0.113.7', '198.51.100.1', NO_PROXIES)).toBe('203.0.113.7');
});

test('X-Forwarded-For from a peer that is not a trusted proxy is ignored', () => {
  expect(clientIp('203.0.113.7', '198.51.100.1', PROXY)).toBe('203.0.113.7');
});

test('X-Forwarded-For from a trusted proxy names the client', () => {
  expect(clientIp('10.0.0.5', '198.51.100.1', PROXY)).toBe('198.51.100.1');
});

test('the client is the nearest address no trusted proxy added', () => {
  // A client can put anything at the front; only what the trusted proxies appended counts.
  const proxies = addressList(['10.0.0.0/8']);
  expect(clientIp('10.0.0.5', '6.6.6.6, 198.51.100.1, 10.0.0.9', proxies)).toBe('198.51.100.1');
});

test('several X-Forwarded-For headers read as one list', () => {
  expect(clientIp('10.0.0.5', ['6.6.6.6', '198.51.100.1'], PROXY)).toBe('198.51.100.1');
});

test('a trusted proxy with no X-Forwarded-For, or an unreadable one, is the client itself', () => {
  expect(clientIp('10.0.0.5', undefined, PROXY)).toBe('10.0.0.5');
  expect(clientIp('10.0.0.5', 'not an ip', PROXY)).toBe('10.0.0.5');
});

test('IPv4 addresses mapped to IPv6 read as IPv4', () => {
  expect(clientIp('::ffff:127.0.0.1', undefined, NO_PROXIES)).toBe('127.0.0.1');
  expect(clientIp('::ffff:10.0.0.5', '::ffff:198.51.100.1', PROXY)).toBe('198.51.100.1');
});

test('an address list matches addresses and CIDR ranges, IPv4 and IPv6', () => {
  const list = addressList(['127.0.0.1', '::1', '192.168.0.0/16', 'fd00::/8']);
  expect(['127.0.0.1', '::1', '192.168.4.2', 'fd12::1'].map((ip) => list.has(ip))).toEqual([
    true,
    true,
    true,
    true,
  ]);
  expect(['127.0.0.2', '10.0.0.1', '2001:db8::1', ''].map((ip) => list.has(ip))).toEqual([
    false,
    false,
    false,
    false,
  ]);
});
