import type { IncomingHttpHeaders } from 'node:http';
import ipaddr from 'ipaddr.js';
import proxyaddr from 'proxy-addr';

/** A set of addresses and CIDR ranges (`LIMITS_EXEMPT_IPS`, `TRUSTED_PROXIES`, design §11). */
export interface AddressList {
  has(ip: string): boolean;
}

/**
 * An address list from entries such as `127.0.0.1`, `::1` or `10.0.0.0/8`. An IPv4 entry also
 * matches the address mapped to IPv6 (`::ffff:127.0.0.1`), as a dual-stack socket reports it.
 */
export function addressList(entries: readonly string[]): AddressList {
  const matches = proxyaddr.compile([...entries]);
  return { has: (ip) => ipaddr.isValid(ip) && matches(ip, 0) };
}

/** As much of a request (Express's, or a WebSocket upgrade's) as `clientIp` reads. */
export interface ClientRequest {
  readonly socket: { readonly remoteAddress?: string | undefined };
  readonly headers: IncomingHttpHeaders;
}

/** An address in one form per address: IPv4 mapped to IPv6 as IPv4, IPv6 in its short form. */
const canonical = (ip: string): string => ipaddr.process(ip).toString();

/**
 * The client's address (design §11): the socket's own, unless that's a trusted proxy. Then it's
 * the nearest `X-Forwarded-For` entry that no trusted proxy added, read from the right, since a
 * client can write anything at the front of the header itself. An entry that isn't an address
 * leaves the last one before it. The same rule as Express's `trust proxy` (`proxy-addr`).
 */
export function clientIp(request: ClientRequest, trustedProxies: AddressList): string {
  const hops = proxyaddr.all(request as Parameters<typeof proxyaddr.all>[0], (address) =>
    trustedProxies.has(address),
  );
  let ip = request.socket.remoteAddress ?? '';
  for (const hop of hops) {
    if (!ipaddr.isValid(hop)) break;
    ip = hop;
  }
  return ipaddr.isValid(ip) ? canonical(ip) : ip;
}
