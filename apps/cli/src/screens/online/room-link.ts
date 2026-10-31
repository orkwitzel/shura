/**
 * A room's link (design §10.3), from the server's URL: the web client and the gateway share an
 * origin (design §13.2), so `wss://host/ws` gives `https://host/r/K7QX`. `null` for a URL that
 * isn't one.
 */
export function roomLink(server: string, code: string): string | null {
  try {
    const url = new URL(server);
    const protocol = url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : null;
    if (protocol === null) return null;
    return `${protocol}//${url.host}/r/${code}`;
  } catch {
    return null;
  }
}
