/**
 * A room's link (design §10.3) at the web client's origin (`webUrl`): `https://host` gives
 * `https://host/r/K7QX`. `null` for a URL that isn't an HTTP one.
 */
export function roomLink(web: string, code: string): string | null {
  if (!URL.canParse(web)) return null;
  const { protocol, origin } = new URL(web);
  if (protocol !== 'http:' && protocol !== 'https:') return null;
  return `${origin}/r/${code}`;
}
