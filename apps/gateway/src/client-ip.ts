import { BlockList, isIP } from 'node:net';

/** A set of addresses and CIDR ranges (`LIMITS_EXEMPT_IPS`, `TRUSTED_PROXIES`, design §11). */
export interface AddressList {
  has(ip: string): boolean;
}

/** An address list from entries such as `127.0.0.1`, `::1` or `10.0.0.0/8`. */
export function addressList(entries: readonly string[]): AddressList {
  const list = new BlockList();
  for (const entry of entries) {
    const [address = '', prefix] = entry.split('/');
    const type = isIP(address) === 6 ? 'ipv6' : 'ipv4';
    if (prefix === undefined) list.addAddress(address, type);
    else list.addSubnet(address, Number(prefix), type);
  }
  return {
    has(ip) {
      const address = normalizeIp(ip);
      const family = isIP(address);
      return family !== 0 && list.check(address, family === 6 ? 'ipv6' : 'ipv4');
    },
  };
}

/** An IPv4 address mapped to IPv6 (`::ffff:1.2.3.4`, as a dual-stack socket reports it) as IPv4. */
export function normalizeIp(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return mapped?.[1] ?? ip;
}

/**
 * The client's address (design §11): the socket's own, unless that's a trusted proxy. Then it's
 * the nearest `X-Forwarded-For` entry that no trusted proxy added, read from the right, since a
 * client can write anything at the front of the header itself.
 */
export function clientIp(
  socketAddress: string,
  forwardedFor: string | readonly string[] | undefined,
  trustedProxies: AddressList,
): string {
  let ip = normalizeIp(socketAddress);
  if (!trustedProxies.has(ip) || forwardedFor === undefined) return ip;
  const hops = [forwardedFor]
    .flat()
    .flatMap((header) => header.split(','))
    .map((hop) => normalizeIp(hop.trim()));
  for (const hop of hops.reverse()) {
    if (isIP(hop) === 0) break;
    ip = hop;
    if (!trustedProxies.has(hop)) break;
  }
  return ip;
}
