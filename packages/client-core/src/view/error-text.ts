/**
 * The plain words both clients show for the abuse limits (design §11): what happened, and what to
 * do about it. `rate_limited` keeps the server's words, since how long to wait depends on which
 * limit it was (the message rate, failed joins, new sessions, the quick-match cooldown).
 */
const LIMIT_TEXT: Readonly<Record<string, string>> = {
  too_many_connections: 'Too many connections from your network. Try again in a minute.',
  room_limit: 'Too many rooms created. Try again in a minute.',
};

/**
 * What the UIs say for a server error (`exception`, a refused request, a failed connection) with
 * `code`: the plain words for a limit, else the server's own message.
 */
export function errorText(code: string, serverMessage: string): string {
  return Object.hasOwn(LIMIT_TEXT, code) ? (LIMIT_TEXT[code] as string) : serverMessage;
}
