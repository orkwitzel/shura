import type { ErrorCode } from '@shura/protocol';

/**
 * The plain words both clients show for the abuse limits (design §11): what happened, and what to
 * do about it. `rate_limited` keeps the server's words, since how long to wait depends on which
 * limit it was (the message rate, failed joins, the quick-match cooldown).
 */
const LIMIT_TEXT: Partial<Record<ErrorCode, string>> = {
  too_many_connections: 'Too many connections from your network. Try again in a minute.',
  room_limit: 'Too many rooms created. Try again in a minute.',
};

/** What the UIs say for an `error` with `code`: the plain words for a limit, else the server's. */
export function errorText(code: ErrorCode, serverMessage: string): string {
  return LIMIT_TEXT[code] ?? serverMessage;
}
