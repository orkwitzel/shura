/**
 * A room's link (design §10.3), from the server's URL: the web client and the gateway share an
 * origin (design §13.2), so `https://host` gives `https://host/r/K7QX`. `null` for a URL that
 * isn't an HTTP one.
 */
export function roomLink(server: string, code: string): string | null {
  if (!URL.canParse(server)) return null;
  const { protocol, origin } = new URL(server);
  if (protocol !== 'http:' && protocol !== 'https:') return null;
  return `${origin}/r/${code}`;
}
